require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

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

client.once('ready', () => {
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
});

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

  // Check channel constraints (only check if message is in a server/guild)
  const isDM = !message.guild;
  if (!isDM && CHANNEL_ID && CHANNEL_ID !== 'your_channel_id_here') {
    if (message.channel.id !== CHANNEL_ID) {
      if (content.startsWith('!')) {
        console.log(`❌ Command ignored: Sent in channel ${message.channel.id}, but bot is locked to channel ${CHANNEL_ID}`);
      }
      return;
    }
  }

  // Help command
  if (content === '!help-tests') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('ℹ️ Playwright Test Bot Help')
      .setColor('#3498db')
      .setDescription('Run Playwright tests or trigger admin creation directly from Discord.')
      .addFields(
        { name: '`!run-tests`', value: 'Runs all Playwright tests (headless).' },
        { name: '`!run-tests <script>`', value: 'Runs a specific script from package.json (e.g. `!run-tests register`, `!run-tests shareEmail`).' },
        { name: '`!run-tests <spec-name>`', value: 'Runs a specific spec file (e.g. `!run-tests registration`).' },
        { name: '`!create-admin <args>`', value: 'Creates a new Administrator account.\n*Formats supported:*\n1. Positional: `!create-admin username FirstName LastName email@test.com "University Name" Role1,Role2`\n2. Key-value: `!create-admin username=usr firstname=fn lastname=ln email=em university="Univ" roles=Role1,Role2`' }
      );
    return message.channel.send({ embeds: [helpEmbed] });
  }

  // Run tests command
  if (content.startsWith('!run-tests')) {
    const args = content.split(' ').slice(1);
    const testArg = args[0] ? args[0].trim() : null;

    let command = 'npx playwright test';
    let targetDescription = 'all tests';

    // Map known scripts or match spec files
    if (testArg) {
      const knownScripts = ['shareEmail', 'shareInst', 'scheduledShare', 'shareDoc', 'register', 'debugRegister'];
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
      .setDescription(`Executing **${targetDescription}**...\nCommand: \`${command}\``)
      .setTimestamp();

    const statusMessage = await message.channel.send({ embeds: [startEmbed] });

    // Clean test-results folder before running tests
    const testResultsDir = path.join(__dirname, '..', 'test-results');
    cleanDirectory(testResultsDir);

    // Execute the tests
    exec(command, { cwd: path.join(__dirname, '..') }, async (error, stdout, stderr) => {
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
        .setDescription(`Completed running **${targetDescription}**`)
        .addFields(
          { name: 'Summary', value: `✅ Passed: **${passedCount}**\n❌ Failed: **${failedCount}**\n⚠️ Flaky: **${flakyCount}**\n⏭️ Skipped: **${skippedCount}**`, inline: true },
          { name: 'Duration', value: `⏱️ ${duration}`, inline: true }
        )
        .setTimestamp();

      if (failureDetails) {
        reportEmbed.addFields({ name: 'Failure Details (first few lines)', value: failureDetails });
      }

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
    const adminData = parseCreateAdminArgs(content);
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
      .setDescription(`Starting automation for **${adminData.username}** (${adminData.firstName} ${adminData.lastName})...\nUniversity: *${adminData.university}*${adminData.campus ? `\nCampus: *${adminData.campus}*` : ''}\nRoles: *${adminData.roles.join(', ')}*`)
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

    // 3. Execute test
    exec(command, { cwd: path.join(__dirname, '..') }, async (error, stdout, stderr) => {
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
