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
      .setDescription('Run Playwright tests directly from Discord and receive reports.')
      .addFields(
        { name: '`!run-tests`', value: 'Runs all Playwright tests (headless).' },
        { name: '`!run-tests <script>`', value: 'Runs a specific script from package.json (e.g. `!run-tests register`, `!run-tests shareEmail`).' },
        { name: '`!run-tests <spec-name>`', value: 'Runs a specific spec file (e.g. `!run-tests registration`).' }
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
});

if (BOT_TOKEN && BOT_TOKEN !== 'your_bot_token_here') {
  client.login(BOT_TOKEN).catch(err => {
    console.error('Error logging into Discord:', err);
  });
} else {
  console.warn('DISCORD_BOT_TOKEN is not configured in .env. Discord bot will not start.');
}
