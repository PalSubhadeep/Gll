require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getEnvFromMongo, updateEnvInMongo } = require('./mongoEnvLoader');

// Initialize Discord Client with DM support
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages, // Enabled Direct Messages intent
  ],
  partials: [
    Partials.Channel, // Required for DMs in discord.js v14
  ],
});

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// Helper to find all PNG/WEBM attachments in test-results/
function getTestAttachments(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getTestAttachments(filePath, fileList);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.png' || ext === '.webm') {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

// Helper to clean test-results directory
function cleanDirectory(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to clean directory ${dir}:`, err);
    }
  }
}

// Helper to strip quotes from values
function stripQuotes(str) {
  if (!str) return '';
  let val = str.trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.substring(1, val.length - 1).trim();
  }
  if (val.startsWith("'") && val.endsWith("'")) {
    val = val.substring(1, val.length - 1).trim();
  }
  return val;
}

// Helper to resolve environment URL from user input (defaults to DEV if not specified)
function resolveEnvironment(envInput) {
  if (!envInput) {
    return { envName: 'DEV (Default)', baseUrl: 'https://lockerdev.glcredentials.com/' };
  }
  const val = envInput.trim().toLowerCase();
  if (val === 'uat' || val === 'https://lockeruat.glcredentials.com' || val === 'https://lockeruat.glcredentials.com/') {
    return { envName: 'UAT', baseUrl: 'https://lockeruat.glcredentials.com/' };
  }
  if (val === 'dev' || val === 'https://lockerdev.glcredentials.com' || val === 'https://lockerdev.glcredentials.com/') {
    return { envName: 'DEV', baseUrl: 'https://lockerdev.glcredentials.com/' };
  }
  if (val === 'demo' || val === 'lockerdemo' || val === 'https://lockerdemo.glcredentials.com' || val === 'https://lockerdemo.glcredentials.com/') {
    return { envName: 'DEMO', baseUrl: 'https://lockerdemo.glcredentials.com/' };
  }
  if (val.startsWith('http://') || val.startsWith('https://')) {
    return { envName: 'CUSTOM', baseUrl: val.endsWith('/') ? val : `${val}/` };
  }
  return { envName: 'DEV (Default)', baseUrl: 'https://lockerdev.glcredentials.com/' };
}

// Helper to extract and attach scheduled share timing details to Discord embed if present
function attachScheduledShareTimingField(reportEmbed, output) {
  const sharedTimeMatch = output.match(/Shared Time \(Executed At\)\s*:\s*([^\r\n]+)/i);
  const expectedDeliveryMatch = output.match(/Expected Delivery Time\s*:\s*([^\r\n]+)/i);

  if (sharedTimeMatch || expectedDeliveryMatch) {
    const sharedTimeStr = sharedTimeMatch ? sharedTimeMatch[1].trim() : 'N/A';
    const expectedDeliveryStr = expectedDeliveryMatch ? expectedDeliveryMatch[1].trim() : 'N/A';
    reportEmbed.addFields({
      name: '⏰ Scheduled Share Timing Details',
      value: `• **Shared Time (Executed At)**: \`${sharedTimeStr}\`\n• **Expected Delivery Time**: \`${expectedDeliveryStr}\``,
      inline: false
    });
  }
}

// Helper to calculate scheduled share timing for initial start embed
function getScheduledShareTimingSummary(testArg) {
  const isScheduledTest = !testArg || testArg === 'all' || testArg === 'scheduledShare' || testArg.includes('scheduledShare');
  if (!isScheduledTest) return null;

  try {
    const executedAt = new Date();
    const explicit = process.env.SCHEDULE_AT;
    let targetTime;
    let offsetMinutes = parseInt(process.env.SCHEDULE_OFFSET_MINUTES || '10', 10);
    if (isNaN(offsetMinutes) || offsetMinutes <= 0) offsetMinutes = 10;

    if (explicit) {
      targetTime = new Date(explicit);
      if (isNaN(targetTime.getTime())) targetTime = new Date(executedAt.getTime() + offsetMinutes * 60000);
    } else {
      targetTime = new Date(executedAt.getTime() + offsetMinutes * 60000);
    }

    // Snap to nearest 10-minute step (matching ScheduleShareModal behavior)
    const snapped = new Date(targetTime);
    const rounded = Math.round(targetTime.getMinutes() / 10) * 10;
    if (rounded === 60) {
      snapped.setHours(snapped.getHours() + 1, 0, 0, 0);
    } else {
      snapped.setMinutes(rounded, 0, 0);
    }

    return {
      sharedTime: executedAt.toLocaleString(),
      expectedDeliveryTime: snapped.toLocaleString(),
      offsetMinutes: offsetMinutes
    };
  } catch (e) {
    return null;
  }
}

// Helper to parse create-admin arguments
function parseCreateAdminArgs(content) {
  const argsString = content.substring('!create-admin'.length).trim();
  if (!argsString) return null;

  const isKeyValue = argsString.toLowerCase().includes('username=') || argsString.toLowerCase().includes('email=');

  if (isKeyValue) {
    const result = {
      username: '',
      firstName: '',
      lastName: '',
      email: '',
      university: '',
      roles: [],
      campus: ''
    };

    const regex = /(username|firstname|lastname|email|university|roles|campus)\s*=\s*/gi;
    let match;
    const matches = [];
    while ((match = regex.exec(argsString)) !== null) {
      matches.push({
        key: match[1].toLowerCase(),
        index: match.index,
        length: match[0].length
      });
    }

    if (matches.length === 0) return null;
    matches.sort((a, b) => a.index - b.index);

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const startValueIdx = current.index + current.length;
      const endValueIdx = (i + 1 < matches.length) ? matches[i + 1].index : argsString.length;
      let val = argsString.substring(startValueIdx, endValueIdx).trim();

      if (current.key === 'username') result.username = stripQuotes(val);
      else if (current.key === 'firstname') result.firstName = stripQuotes(val);
      else if (current.key === 'lastname') result.lastName = stripQuotes(val);
      else if (current.key === 'email') result.email = stripQuotes(val);
      else if (current.key === 'university') result.university = stripQuotes(val);
      else if (current.key === 'roles') {
        result.roles = stripQuotes(val).split(',').map(r => stripQuotes(r)).filter(Boolean);
      }
      else if (current.key === 'campus') result.campus = stripQuotes(val);
    }
    return result;
  } else {
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const matches = [];
    let match;
    while ((match = regex.exec(argsString)) !== null) {
      matches.push(match[1] || match[2] || match[0]);
    }

    if (matches.length < 6) return null;

    return {
      username: stripQuotes(matches[0]),
      firstName: stripQuotes(matches[1]),
      lastName: stripQuotes(matches[2]),
      email: stripQuotes(matches[3]),
      university: stripQuotes(matches[4]),
      roles: stripQuotes(matches[5]).split(',').map(r => stripQuotes(r)).filter(Boolean),
      campus: stripQuotes(matches[6] || '')
    };
  }
}

client.once('ready', async () => {
  console.log(`\n==================================================`);
  console.log(`🤖 Bot logged in successfully as: ${client.user.tag}`);
  console.log(`==================================================`);
  console.log(`👉 Invite URL: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=117760&scope=bot`);
  
  if (!CHANNEL_ID || CHANNEL_ID === 'your_channel_id_here') {
    console.log(`⚠️ CHANNEL_ID is not configured or left as default in .env.`);
    console.log(`   The bot will listen to and respond in ANY channel.`);
  } else {
    console.log(`📡 Listening for commands in Channel ID: ${CHANNEL_ID}`);
  }
  console.log(`==================================================\n`);

  // Register Slash Commands globally
  try {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    const commands = [
      new SlashCommandBuilder()
        .setName('help-tests')
        .setDescription('Show help and available commands for testing'),

      new SlashCommandBuilder()
        .setName('run-tests')
        .setDescription('Run Playwright tests')
        .addStringOption(option =>
          option.setName('testname')
            .setDescription('Name of the test script or spec file to run (optional)')
            .setRequired(false)
            .addChoices(
              { name: 'All Tests', value: 'all' },
              { name: 'shareEmail', value: 'shareEmail' },
              { name: 'shareInst', value: 'shareInst' },
              { name: 'scheduledShare', value: 'scheduledShare' },
              { name: 'shareDoc', value: 'shareDoc' },
              { name: 'shareBadge', value: 'shareBadge' },
              { name: 'shareCertificate', value: 'shareCertificate' }
            ))
        .addStringOption(option =>
          option.setName('env')
            .setDescription('Target environment (optional, defaults to DEV)')
            .setRequired(false)
            .addChoices(
              { name: 'UAT (https://lockeruat.glcredentials.com)', value: 'uat' },
              { name: 'DEV (https://lockerdev.glcredentials.com)', value: 'dev' },
              { name: 'DEMO (https://lockerdemo.glcredentials.com)', value: 'demo' }
            )),

      new SlashCommandBuilder()
        .setName('create-admin')
        .setDescription('Create a new administrator user via Super Admin Portal')
        .addStringOption(option =>
          option.setName('username')
            .setDescription('Username for the new admin')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('firstname')
            .setDescription('First name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('lastname')
            .setDescription('Last name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('email')
            .setDescription('Email address')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('university')
            .setDescription('University name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('roles')
            .setDescription('Comma-separated roles (e.g. Counselor, Receiver)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('campus')
            .setDescription('Campus name (optional)')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('env')
            .setDescription('Target environment (optional, defaults to DEV)')
            .setRequired(false)
            .addChoices(
              { name: 'UAT (https://lockeruat.glcredentials.com)', value: 'uat' },
              { name: 'DEV (https://lockerdev.glcredentials.com)', value: 'dev' },
              { name: 'DEMO (https://lockerdemo.glcredentials.com)', value: 'demo' }
            )),

      new SlashCommandBuilder()
        .setName('view-env')
        .setDescription('View environment variables stored in MongoDB Atlas')
        .addStringOption(option =>
          option.setName('env')
            .setDescription('Target environment (optional, defaults to DEV)')
            .setRequired(false)
            .addChoices(
              { name: 'DEV', value: 'dev' },
              { name: 'UAT', value: 'uat' },
              { name: 'DEMO', value: 'demo' }
            )),

      new SlashCommandBuilder()
        .setName('update-env')
        .setDescription('Update or add an environment variable in MongoDB Atlas')
        .addStringOption(option =>
          option.setName('env')
            .setDescription('Target environment (dev, uat, demo)')
            .setRequired(true)
            .addChoices(
              { name: 'DEV', value: 'dev' },
              { name: 'UAT', value: 'uat' },
              { name: 'DEMO', value: 'demo' }
            ))
        .addStringOption(option =>
          option.setName('key')
            .setDescription('Environment variable key (e.g. STUDENT_USERNAME, BASE_URL)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('value')
            .setDescription('Environment variable value')
            .setRequired(true))
    ].map(command => command.toJSON());

    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

// Handle Slash Command Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Check channel constraints (only check if interaction is in a server/guild)
  if (interaction.guild && CHANNEL_ID && CHANNEL_ID !== 'your_channel_id_here') {
    if (interaction.channelId !== CHANNEL_ID) {
      return interaction.reply({
        content: `❌ Bot commands can only be executed in the designated channel (<#${CHANNEL_ID}>).`,
        ephemeral: true
      });
    }
  }

  // help-tests command
  if (commandName === 'help-tests') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('ℹ️ Playwright Test Bot Help')
      .setColor('#3498db')
      .setDescription('Run Playwright tests or manage environment variables stored in MongoDB Atlas.')
      .addFields(
        { name: '`/run-tests`', value: 'Runs Playwright tests using MongoDB Atlas configs (`dev`, `uat`, `demo`).' },
        { name: '`/create-admin`', value: 'Creates a new Administrator account (`dev`, `uat`, `demo`).' },
        { name: '`/view-env`', value: 'View variables stored in MongoDB Atlas for an environment.' },
        { name: '`/update-env`', value: 'Update or set an environment variable in MongoDB Atlas dynamically.' }
      );
    return interaction.reply({ embeds: [helpEmbed] });
  }

  // view-env command
  if (commandName === 'view-env') {
    const envArg = (interaction.options.getString('env') || 'dev').toLowerCase();
    await interaction.deferReply();

    const mongoVars = await getEnvFromMongo(envArg);
    if (!mongoVars || Object.keys(mongoVars).length === 0) {
      return interaction.editReply({
        content: `⚠️ No environment variables found in MongoDB Atlas for **${envArg.toUpperCase()}**. Run \`npm run env:seed\` or \`/update-env\` to add variables.`
      });
    }

    const varLines = Object.entries(mongoVars).map(([k, v]) => {
      const isSensitive = k.includes('PASSWORD') || k.includes('TOKEN') || k.includes('SECRET');
      const valDisplay = isSensitive ? '********' : v;
      return `• **${k}**: \`${valDisplay}\``;
    }).slice(0, 25).join('\n');

    const envEmbed = new EmbedBuilder()
      .setTitle(`📁 MongoDB Atlas Variables: [${envArg.toUpperCase()}]`)
      .setColor('#3498db')
      .setDescription(varLines || 'No variables')
      .setFooter({ text: `Total Variables: ${Object.keys(mongoVars).length}` })
      .setTimestamp();

    return interaction.editReply({ embeds: [envEmbed] });
  }

  // update-env command
  if (commandName === 'update-env') {
    const envArg = interaction.options.getString('env').toLowerCase();
    const key = interaction.options.getString('key').trim();
    const val = interaction.options.getString('value').trim();

    await interaction.deferReply();

    try {
      await updateEnvInMongo(envArg, key, val);
      const isSensitive = key.includes('PASSWORD') || key.includes('TOKEN') || key.includes('SECRET');
      const displayVal = isSensitive ? '********' : val;

      const successEmbed = new EmbedBuilder()
        .setTitle(`✅ MongoDB Atlas Updated: [${envArg.toUpperCase()}]`)
        .setColor('#2ecc71')
        .setDescription(`Successfully updated variable for **${envArg.toUpperCase()}**:\n• **${key}** = \`${displayVal}\``)
        .setTimestamp();

      return interaction.editReply({ embeds: [successEmbed] });
    } catch (err) {
      return interaction.editReply({ content: `❌ Error updating MongoDB Atlas: ${err.message}` });
    }
  }

  // run-tests command
  if (commandName === 'run-tests') {
    const testArg = interaction.options.getString('testname');
    const envOption = interaction.options.getString('env');
    const resolvedEnv = resolveEnvironment(envOption);
    const targetEnvKey = (envOption || 'dev').toLowerCase();
    const envDisplay = resolvedEnv.envName ? `${resolvedEnv.envName} (${resolvedEnv.baseUrl})` : `Default (${process.env.BASE_URL || 'from .env'})`;

    // Defer reply immediately to prevent 3-second timeout
    await interaction.deferReply();

    let command = 'npx playwright test';
    let targetDescription = 'all tests';

    if (testArg && testArg !== 'all') {
      const knownScripts = ['shareEmail', 'shareInst', 'scheduledShare', 'shareDoc', 'shareBadge', 'shareCertificate', 'ferpa', 'register', 'debugRegister'];
      if (knownScripts.includes(testArg)) {
        command = `npm run ${testArg}`;
        targetDescription = `npm script: ${testArg}`;
      } else {
        const specName = testArg.endsWith('.spec.ts') ? testArg : `${testArg}.spec.ts`;
        command = `npx playwright test tests/${specName}`;
        targetDescription = `spec file: ${specName}`;
      }
    }

    const startEmbed = new EmbedBuilder()
      .setTitle('⏳ Playwright Execution Started')
      .setColor('#f1c40f')
      .setDescription(`Executing **${targetDescription}**...\nTarget Environment: **${envDisplay}**\nCommand: \`${command}\``)
      .setTimestamp();

    const timingSummary = getScheduledShareTimingSummary(testArg);
    if (timingSummary) {
      startEmbed.addFields({
        name: '⏰ Scheduled Share Timing Information',
        value: `• **Shared Time (Executed At)**: \`${timingSummary.sharedTime}\`\n• **Expected Delivery Time**: \`${timingSummary.expectedDeliveryTime}\` *(+${timingSummary.offsetMinutes} mins, snapped)*`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [startEmbed] });

    // Clean test-results folder
    const testResultsDir = path.join(__dirname, '..', 'test-results');
    cleanDirectory(testResultsDir);

    const execEnv = { ...process.env, ENV: targetEnvKey };
    if (resolvedEnv.baseUrl) {
      execEnv.BASE_URL = resolvedEnv.baseUrl;
    }
    const mongoVars = await getEnvFromMongo(targetEnvKey);
    if (mongoVars && Object.keys(mongoVars).length > 0) {
      for (const [k, v] of Object.entries(mongoVars)) {
        execEnv[k] = v;
      }
    }

    // Execute the tests
    exec(command, { cwd: path.join(__dirname, '..'), env: execEnv }, async (error, stdout, stderr) => {
      const output = stdout + '\n' + stderr;
      console.log(output);

      // Parse results
      const passedMatch = output.match(/(\d+)\s+passed/);
      const failedMatch = output.match(/(\d+)\s+failed/);
      const flakyMatch = output.match(/(\d+)\s+flaky/);
      const skippedMatch = output.match(/(\d+)\s+skipped/);
      const durationMatch = output.match(/passed\s+\(([\w\s.]+)\)/) || output.match(/\(([\w\s.]+)\)/);

      const passedCount = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const failedCount = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const flakyCount = flakyMatch ? parseInt(flakyMatch[1], 10) : 0;
      const skippedCount = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
      const duration = durationMatch ? durationMatch[1] : 'unknown duration';

      const isSuccess = failedCount === 0 && error === null;
      const resultColor = isSuccess ? '#2ecc71' : '#e74c3c';
      const resultTitle = isSuccess ? '✅ Playwright Tests Passed' : '❌ Playwright Tests Failed';

      // Build failure details if any
      let failureDetails = '';
      if (!isSuccess) {
        const errorLines = output.split('\n')
          .filter(line => line.includes('Error:') || line.includes('Test timeout') || line.includes('Call log:'))
          .slice(0, 10)
          .join('\n');
        failureDetails = errorLines ? `\`\`\`text\n${errorLines.substring(0, 800)}\n\`\`\`` : '\nCheck attached logs/screenshots.';
      }

      // Collect attachments (screenshots/videos) from test-results
      const attachments = [];
      const files = getTestAttachments(testResultsDir);
      for (const file of files) {
        if (fs.existsSync(file)) {
          attachments.push(new AttachmentBuilder(file));
        }
      }

      const reportEmbed = new EmbedBuilder()
        .setTitle(resultTitle)
        .setColor(resultColor)
        .setDescription(`Completed running **${targetDescription}** on **${envDisplay}**`)
        .addFields(
          { name: 'Summary', value: `✅ Passed: **${passedCount}**\n❌ Failed: **${failedCount}**\n⚠️ Flaky: **${flakyCount}**\n⏭️ Skipped: **${skippedCount}**`, inline: true },
          { name: 'Duration', value: `⏱️ ${duration}`, inline: true }
        )
        .setTimestamp();

      if (failureDetails) {
        reportEmbed.addFields({ name: 'Failure Details (first few lines)', value: failureDetails });
      }

      attachScheduledShareTimingField(reportEmbed, output);

      if (output.length > 1024) {
        const logPath = path.join(__dirname, '..', 'test-run.log');
        try {
          fs.writeFileSync(logPath, output);
          attachments.push(new AttachmentBuilder(logPath));
          await interaction.editReply({ embeds: [reportEmbed], files: attachments });
          fs.unlinkSync(logPath);
        } catch (e) {
          console.error('Error handling log file attachment:', e);
          reportEmbed.addFields({ name: 'Execution Output', value: 'Check console logs (too long to display).' });
          await interaction.editReply({ embeds: [reportEmbed], files: attachments });
        }
      } else {
        reportEmbed.addFields({ name: 'Execution Output', value: `\`\`\`text\n${output || 'No output'}\n\`\`\`` });
        await interaction.editReply({ embeds: [reportEmbed], files: attachments });
      }
    });
  }

  // create-admin command
  if (commandName === 'create-admin') {
    const envOption = interaction.options.getString('env');
    const resolvedEnv = resolveEnvironment(envOption);
    const envDisplay = resolvedEnv.envName ? `${resolvedEnv.envName} (${resolvedEnv.baseUrl})` : `Default (${process.env.BASE_URL || 'from .env'})`;

    const adminData = {
      username: interaction.options.getString('username'),
      firstName: interaction.options.getString('firstname'),
      lastName: interaction.options.getString('lastname'),
      email: interaction.options.getString('email'),
      university: interaction.options.getString('university'),
      roles: interaction.options.getString('roles').split(',').map(r => r.trim()).filter(Boolean),
      campus: interaction.options.getString('campus') || ''
    };

    // Defer reply immediately to prevent 3-second timeout
    await interaction.deferReply();

    const startEmbed = new EmbedBuilder()
      .setTitle('⏳ Creating Administrator')
      .setColor('#f1c40f')
      .setDescription(`Starting automation for **${adminData.username}** (${adminData.firstName} ${adminData.lastName})...\nTarget Environment: **${envDisplay}**\nUniversity: *${adminData.university}*${adminData.campus ? `\nCampus: *${adminData.campus}*` : ''}\nRoles: *${adminData.roles.join(', ')}*`)
      .setTimestamp();

    await interaction.editReply({ embeds: [startEmbed] });

    // Write input data to admin_input.json
    const inputPath = path.join(__dirname, '..', 'admin_input.json');
    const outputPath = path.join(__dirname, '..', 'admin_output.json');

    // Clean up old output/input if they exist
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch(e) {}
    }
    if (fs.existsSync(inputPath)) {
      try { fs.unlinkSync(inputPath); } catch(e) {}
    }

    fs.writeFileSync(inputPath, JSON.stringify(adminData, null, 2));

    // Clean test-results folder
    const testResultsDir = path.join(__dirname, '..', 'test-results');
    cleanDirectory(testResultsDir);

    const command = 'npx playwright test tests/createAdmin.spec.ts --headed';

    const execEnv = { ...process.env };
    if (resolvedEnv.baseUrl) {
      execEnv.BASE_URL = resolvedEnv.baseUrl;
    }

    // Execute test
    exec(command, { cwd: path.join(__dirname, '..'), env: execEnv }, async (error, stdout, stderr) => {
      const output = stdout + '\n' + stderr;
      console.log(output);

      // Read outcomes
      let outcome = { success: false, error: 'Could not retrieve test output.' };
      if (fs.existsSync(outputPath)) {
        try {
          outcome = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        } catch (e) {
          console.error('Error parsing admin_output.json:', e);
        }
      }

      const resultColor = outcome.success ? '#2ecc71' : '#e74c3c';
      const resultTitle = outcome.success ? '✅ Administrator Created' : '❌ Administrator Creation Failed';

      // Collect attachments (screenshots/videos) from test-results
      const attachments = [];
      const files = getTestAttachments(testResultsDir);
      for (const file of files) {
        if (fs.existsSync(file)) {
          attachments.push(new AttachmentBuilder(file));
        }
      }

      const reportEmbed = new EmbedBuilder()
        .setTitle(resultTitle)
        .setColor(resultColor)
        .setDescription(outcome.success ? `Successfully created administrator user **${adminData.username}**.` : `Failed to create administrator user **${adminData.username}**.`)
        .addFields(
          { name: 'Username', value: adminData.username, inline: true },
          { name: 'Name', value: `${adminData.firstName} ${adminData.lastName}`, inline: true },
          { name: 'Email', value: adminData.email, inline: true },
          { name: 'University', value: adminData.university, inline: true }
        )
        .setTimestamp();

      if (adminData.campus) {
        reportEmbed.addFields({ name: 'Campus', value: adminData.campus, inline: true });
      }

      reportEmbed.addFields({ name: 'Roles', value: adminData.roles.join(', '), inline: true });

      if (!outcome.success && outcome.error) {
        reportEmbed.addFields({ name: 'Error Message', value: `\`\`\`text\n${outcome.error.substring(0, 800)}\n\`\`\`` });
      }

      // Cleanup files
      if (fs.existsSync(inputPath)) {
        try { fs.unlinkSync(inputPath); } catch(e) {}
      }
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch(e) {}
      }

      await interaction.editReply({ embeds: [reportEmbed], files: attachments });
    });
  }
});

// Legacy text-message commands parser fallback (retains support for traditional "!help-tests", etc.)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // If message starts with '!', log it for debugging
  if (content.startsWith('!') || message.content.length === 0) {
    console.log(`\n[COMMAND RECEIVED]`);
    console.log(`User: ${message.author.tag}`);
    console.log(`Channel ID: ${message.channel.id}`);
    console.log(`Content: "${message.content}"`);

    if (message.content.length === 0) {
      console.warn(`⚠️ WARNING: Received empty message content!`);
      console.warn(`   This means 'Message Content Intent' is NOT enabled in your Discord Developer Portal.`);
      console.warn(`   Please go to https://discord.com/developers/applications, select your bot,`);
      console.warn(`   go to the 'Bot' tab, scroll down to 'Privileged Gateway Intents',`);
      console.warn(`   and enable 'MESSAGE CONTENT INTENT'. Then restart the bot.`);
    }
  }

  // Check channel constraints
  const isDM = !message.guild;
  if (!isDM && CHANNEL_ID && CHANNEL_ID !== 'your_channel_id_here') {
    if (message.channel.id !== CHANNEL_ID) return;
  }

  // Help command
  if (content === '!help-tests') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('ℹ️ Playwright Test Bot Help')
      .setColor('#3498db')
      .setDescription('Run Playwright tests or manage environment variables stored in MongoDB Atlas.')
      .addFields(
        { name: '`!run-tests`', value: 'Runs Playwright tests (`--env=dev`, `--env=uat`, `--env=demo`).' },
        { name: '`!run-tests <script>`', value: 'Runs a specific script from package.json (e.g. `!run-tests shareEmail --env=demo`).' },
        { name: '`!view-env <dev|uat|demo>`', value: 'Displays environment variables stored in MongoDB Atlas.' },
        { name: '`!update-env <dev|uat|demo> KEY=VALUE`', value: 'Updates an environment variable in MongoDB Atlas (e.g. `!update-env dev STUDENT_USERNAME=subha-700`).' },
        { name: '`!create-admin <args>`', value: 'Creates a new Administrator account.' }
      );
    return message.channel.send({ embeds: [helpEmbed] });
  }

  // View environment variables command
  if (content.startsWith('!view-env')) {
    const rawArgs = content.split(' ').slice(1);
    const targetEnv = (rawArgs[0] || 'dev').toLowerCase();
    const mongoVars = await getEnvFromMongo(targetEnv);

    if (!mongoVars || Object.keys(mongoVars).length === 0) {
      return message.channel.send(`⚠️ No environment variables found in MongoDB Atlas for **${targetEnv.toUpperCase()}**.`);
    }

    const varLines = Object.entries(mongoVars).map(([k, v]) => {
      const isSensitive = k.includes('PASSWORD') || k.includes('TOKEN') || k.includes('SECRET');
      const valDisplay = isSensitive ? '********' : v;
      return `• **${k}**: \`${valDisplay}\``;
    }).slice(0, 25).join('\n');

    const envEmbed = new EmbedBuilder()
      .setTitle(`📁 MongoDB Atlas Variables: [${targetEnv.toUpperCase()}]`)
      .setColor('#3498db')
      .setDescription(varLines || 'No variables')
      .setFooter({ text: `Total Variables: ${Object.keys(mongoVars).length}` })
      .setTimestamp();

    return message.channel.send({ embeds: [envEmbed] });
  }

  // Update environment variable command
  if (content.startsWith('!update-env')) {
    const rawArgs = content.split(' ').slice(1);
    const targetEnv = (rawArgs[0] || '').toLowerCase();
    const kvPair = rawArgs.slice(1).join(' ');
    
    if (!['dev', 'uat', 'demo'].includes(targetEnv) || !kvPair.includes('=')) {
      return message.channel.send(`❌ Invalid format. Usage: \`!update-env <dev|uat|demo> KEY=VALUE\` (e.g. \`!update-env dev STUDENT_USERNAME=subha-700\`)`);
    }

    const eqIdx = kvPair.indexOf('=');
    const key = kvPair.substring(0, eqIdx).trim();
    const value = kvPair.substring(eqIdx + 1).trim();

    try {
      await updateEnvInMongo(targetEnv, key, value);
      const isSensitive = key.includes('PASSWORD') || key.includes('TOKEN') || key.includes('SECRET');
      const displayVal = isSensitive ? '********' : value;

      const successEmbed = new EmbedBuilder()
        .setTitle(`✅ MongoDB Atlas Updated: [${targetEnv.toUpperCase()}]`)
        .setColor('#2ecc71')
        .setDescription(`Successfully updated variable for **${targetEnv.toUpperCase()}**:\n• **${key}** = \`${displayVal}\``)
        .setTimestamp();

      return message.channel.send({ embeds: [successEmbed] });
    } catch (err) {
      return message.channel.send(`❌ Error updating MongoDB Atlas: ${err.message}`);
    }
  }

  // Run tests command
  if (content.startsWith('!run-tests')) {
    const rawArgs = content.split(' ').slice(1);
    let testArg = null;
    let envArg = null;

    for (const arg of rawArgs) {
      const trimmed = arg.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase().startsWith('--env=')) {
        envArg = trimmed.substring(6);
      } else if (trimmed.toLowerCase().startsWith('env=')) {
        envArg = trimmed.substring(4);
      } else if (['uat', 'dev', 'demo', 'lockerdemo'].includes(trimmed.toLowerCase())) {
        envArg = trimmed;
      } else if (!testArg) {
        testArg = trimmed;
      }
    }

    const resolvedEnv = resolveEnvironment(envArg);
    const targetEnvKey = (envArg || 'dev').toLowerCase();
    const envDisplay = resolvedEnv.envName ? `${resolvedEnv.envName} (${resolvedEnv.baseUrl})` : `Default (${process.env.BASE_URL || 'from .env'})`;

    let command = 'npx playwright test';
    let targetDescription = 'all tests';

    // Map known scripts or match spec files
    if (testArg && testArg !== 'all') {
      const knownScripts = ['shareEmail', 'shareInst', 'scheduledShare', 'shareDoc', 'shareBadge', 'shareCertificate', 'ferpa', 'register', 'debugRegister'];
      if (knownScripts.includes(testArg)) {
        command = `npm run ${testArg}`;
        targetDescription = `npm script: ${testArg}`;
      } else {
        const specName = testArg.endsWith('.spec.ts') ? testArg : `${testArg}.spec.ts`;
        command = `npx playwright test tests/${specName}`;
        targetDescription = `spec file: ${specName}`;
      }
    }

    const startEmbed = new EmbedBuilder()
      .setTitle('🚀 Running Playwright Tests')
      .setColor('#f1c40f')
      .setDescription(`Executing **${targetDescription}**...\nTarget Environment: **${envDisplay}**\nCommand: \`${command}\``)
      .setTimestamp();

    const timingSummary = getScheduledShareTimingSummary(testArg);
    if (timingSummary) {
      startEmbed.addFields({
        name: '⏰ Scheduled Share Timing Information',
        value: `• **Shared Time (Executed At)**: \`${timingSummary.sharedTime}\`\n• **Expected Delivery Time**: \`${timingSummary.expectedDeliveryTime}\` *(+${timingSummary.offsetMinutes} mins, snapped)*`,
        inline: false
      });
    }

    const statusMessage = await message.channel.send({ embeds: [startEmbed] });

    // Clean test-results folder before running tests
    const testResultsDir = path.join(__dirname, '..', 'test-results');
    cleanDirectory(testResultsDir);

    const execEnv = { ...process.env, ENV: targetEnvKey };
    if (resolvedEnv.baseUrl) {
      execEnv.BASE_URL = resolvedEnv.baseUrl;
    }
    const mongoVars = await getEnvFromMongo(targetEnvKey);
    if (mongoVars && Object.keys(mongoVars).length > 0) {
      for (const [k, v] of Object.entries(mongoVars)) {
        execEnv[k] = v;
      }
    }

    // Execute the tests
    exec(command, { cwd: path.join(__dirname, '..'), env: execEnv }, async (error, stdout, stderr) => {
      const output = stdout + '\n' + stderr;
      console.log(output);

      // Parse results
      const passedMatch = output.match(/(\d+)\s+passed/);
      const failedMatch = output.match(/(\d+)\s+failed/);
      const flakyMatch = output.match(/(\d+)\s+flaky/);
      const skippedMatch = output.match(/(\d+)\s+skipped/);
      const durationMatch = output.match(/passed\s+\(([\w\s.]+)\)/) || output.match(/\(([\w\s.]+)\)/);

      const passedCount = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const failedCount = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const flakyCount = flakyMatch ? parseInt(flakyMatch[1], 10) : 0;
      const skippedCount = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
      const duration = durationMatch ? durationMatch[1] : 'unknown duration';

      const isSuccess = failedCount === 0 && error === null;
      const resultColor = isSuccess ? '#2ecc71' : '#e74c3c';
      const resultTitle = isSuccess ? '✅ Playwright Tests Passed' : '❌ Playwright Tests Failed';

      // Build failure details if any
      let failureDetails = '';
      if (!isSuccess) {
        const errorLines = output.split('\n')
          .filter(line => line.includes('Error:') || line.includes('Test timeout') || line.includes('Call log:'))
          .slice(0, 10)
          .join('\n');
        failureDetails = errorLines ? `\`\`\`text\n${errorLines.substring(0, 800)}\n\`\`\`` : '\nCheck attached logs/screenshots.';
      }

      // Collect attachments (screenshots/videos) from test-results
      const attachments = [];
      const files = getTestAttachments(testResultsDir);
      for (const file of files) {
        if (fs.existsSync(file)) {
          attachments.push(new AttachmentBuilder(file));
        }
      }

      const reportEmbed = new EmbedBuilder()
        .setTitle(resultTitle)
        .setColor(resultColor)
        .setDescription(`Completed running **${targetDescription}** on **${envDisplay}**`)
        .addFields(
          { name: 'Summary', value: `✅ Passed: **${passedCount}**\n❌ Failed: **${failedCount}**\n⚠️ Flaky: **${flakyCount}**\n⏭️ Skipped: **${skippedCount}**`, inline: true },
          { name: 'Duration', value: `⏱️ ${duration}`, inline: true }
        )
        .setTimestamp();

      if (failureDetails) {
        reportEmbed.addFields({ name: 'Failure Details (first few lines)', value: failureDetails });
      }

      attachScheduledShareTimingField(reportEmbed, output);

      // If output is too long, attach as a file, otherwise post inline
      if (output.length > 1024) {
        const logPath = path.join(__dirname, '..', 'test-run.log');
        try {
          fs.writeFileSync(logPath, output);
          attachments.push(new AttachmentBuilder(logPath));
          await statusMessage.edit({ embeds: [reportEmbed], files: attachments });
          fs.unlinkSync(logPath);
        } catch (e) {
          console.error('Error handling log file attachment:', e);
          reportEmbed.addFields({ name: 'Execution Output', value: 'Check console logs (too long to display).' });
          await statusMessage.edit({ embeds: [reportEmbed], files: attachments });
        }
      } else {
        reportEmbed.addFields({ name: 'Execution Output', value: `\`\`\`text\n${output || 'No output'}\n\`\`\`` });
        await statusMessage.edit({ embeds: [reportEmbed], files: attachments });
      }
    });
  }

  // Create admin command
  if (content.startsWith('!create-admin')) {
    let envArg = null;
    let cleanContent = content;
    const envMatch = content.match(/--(?:env)=([^\s]+)|env=([^\s]+)/i);
    if (envMatch) {
      envArg = envMatch[1] || envMatch[2];
      cleanContent = content.replace(envMatch[0], '').trim();
    }
    const resolvedEnv = resolveEnvironment(envArg);
    const envDisplay = resolvedEnv.envName ? `${resolvedEnv.envName} (${resolvedEnv.baseUrl})` : `Default (${process.env.BASE_URL || 'from .env'})`;

    const adminData = parseCreateAdminArgs(cleanContent);
    if (!adminData) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Invalid Command Format')
        .setColor('#e74c3c')
        .setDescription('Please provide all required fields in one of these formats:')
        .addFields(
          { name: '1. Key-Value format (recommended if spaces in names/fields)', value: '`!create-admin username=receiver01 firstname=John lastname=Doe email=receiver01@test.com university="Dallas Baptist University" roles=Receiver,Counselor`' },
          { name: '2. Positional format (quotes for names with spaces)', value: '`!create-admin receiver01 John Doe receiver01@test.com "Dallas Baptist University" Receiver,Counselor`' }
        );
      return message.channel.send({ embeds: [errorEmbed] });
    }

    const startEmbed = new EmbedBuilder()
      .setTitle('⏳ Creating Administrator')
      .setColor('#f1c40f')
      .setDescription(`Starting automation for **${adminData.username}** (${adminData.firstName} ${adminData.lastName})...\nTarget Environment: **${envDisplay}**\nUniversity: *${adminData.university}*${adminData.campus ? `\nCampus: *${adminData.campus}*` : ''}\nRoles: *${adminData.roles.join(', ')}*`)
      .setTimestamp();

    const statusMessage = await message.channel.send({ embeds: [startEmbed] });

    // 1. Write the input data to admin_input.json
    const inputPath = path.join(__dirname, '..', 'admin_input.json');
    const outputPath = path.join(__dirname, '..', 'admin_output.json');
    
    // Clean up old output/input if they exist
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch(e) {}
    }
    if (fs.existsSync(inputPath)) {
      try { fs.unlinkSync(inputPath); } catch(e) {}
    }

    fs.writeFileSync(inputPath, JSON.stringify(adminData, null, 2));

    // 2. Clean test-results folder
    const testResultsDir = path.join(__dirname, '..', 'test-results');
    cleanDirectory(testResultsDir);

    const command = 'npx playwright test tests/createAdmin.spec.ts --headed';

    const execEnv = { ...process.env };
    if (resolvedEnv.baseUrl) {
      execEnv.BASE_URL = resolvedEnv.baseUrl;
    }

    // 3. Execute test
    exec(command, { cwd: path.join(__dirname, '..'), env: execEnv }, async (error, stdout, stderr) => {
      const output = stdout + '\n' + stderr;
      console.log(output);

      // 4. Read outcomes
      let outcome = { success: false, error: 'Could not retrieve test output.' };
      if (fs.existsSync(outputPath)) {
        try {
          outcome = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        } catch (e) {
          console.error('Error parsing admin_output.json:', e);
        }
      }

      const resultColor = outcome.success ? '#2ecc71' : '#e74c3c';
      const resultTitle = outcome.success ? '✅ Administrator Created' : '❌ Administrator Creation Failed';

      // Collect attachments (screenshots/videos) from test-results
      const attachments = [];
      const files = getTestAttachments(testResultsDir);
      for (const file of files) {
        if (fs.existsSync(file)) {
          attachments.push(new AttachmentBuilder(file));
        }
      }

      const reportEmbed = new EmbedBuilder()
        .setTitle(resultTitle)
        .setColor(resultColor)
        .setDescription(outcome.success ? `Successfully created administrator user **${adminData.username}**.` : `Failed to create administrator user **${adminData.username}**.`)
        .addFields(
          { name: 'Username', value: adminData.username, inline: true },
          { name: 'Name', value: `${adminData.firstName} ${adminData.lastName}`, inline: true },
          { name: 'Email', value: adminData.email, inline: true },
          { name: 'University', value: adminData.university, inline: true }
        )
        .setTimestamp();

      if (adminData.campus) {
        reportEmbed.addFields({ name: 'Campus', value: adminData.campus, inline: true });
      }

      reportEmbed.addFields({ name: 'Roles', value: adminData.roles.join(', '), inline: true });

      if (!outcome.success && outcome.error) {
        reportEmbed.addFields({ name: 'Error Message', value: `\`\`\`text\n${outcome.error.substring(0, 800)}\n\`\`\`` });
      }

      // Cleanup files
      if (fs.existsSync(inputPath)) {
        try { fs.unlinkSync(inputPath); } catch(e) {}
      }
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch(e) {}
      }

      await statusMessage.edit({ embeds: [reportEmbed], files: attachments });
    });
  }
});

if (BOT_TOKEN && BOT_TOKEN !== 'your_bot_token_here') {
  client.login(BOT_TOKEN).catch(err => {
    console.error('Error logging into Discord:', err);
  });
} else {
  console.warn('DISCORD_BOT_TOKEN is not configured in .env. Discord bot will not start.');
}

// Safety Event Listeners to prevent process crashes on network/interaction timeouts
client.on('error', error => {
  console.error('Discord Client Error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});
