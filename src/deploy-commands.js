// deploy-commands.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { REST, Routes } from 'discord.js';
import { info, warn, error as logError } from './utils/logger.js';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const { BOT_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

// Parse CLI flags
const isDev = process.argv.includes('--dev');
const isClear = process.argv.includes('--clear');

// Set up REST client
const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

// Helper to recursively read .js files
function getCommandFiles(dir) {
  let files = [];
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(getCommandFiles(fullPath));
    } else if (file.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Load commands (skip if clearing)
const commands = [];
if (!isClear) {
  const folder = isDev ? 'dev' : 'global';
  const commandsPath = path.join(__dirname, 'commands', folder);

  if (!fs.existsSync(commandsPath)) {
    warn(`⚠ Commands folder not found: ${commandsPath}`);
  } else {
    const commandFiles = getCommandFiles(commandsPath);

    for (const filePath of commandFiles) {
      try {
        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(fileUrl);
        const command = module.default ?? module; // Works with both export styles

        if (command?.data) {
          //info(`✅ Loaded command: ${command.data.name}`);
          commands.push(command.data.toJSON());
        } else {
          warn(`⚠ Skipped file (no valid command): ${filePath}`);
        }
      } catch (err) {
        logError(`❌ Failed to load command file: ${filePath}`);
        logError(err);
      }
    }
  }
}

async function deploy() {
  try {
    if (isDev) {
      const route = Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);

      if (isClear) {
        info('🧹 Clearing guild commands...');
        await rest.put(route, { body: [] });
        info(`✅ Cleared all guild commands from GUILD_ID: ${GUILD_ID}`);
      } else {
        info(`🚀 Deploying ${commands.length} guild command(s)...`);
        await rest.put(route, { body: commands });
        info(`✅ Successfully deployed guild commands`);
      }

    } else {
      const route = Routes.applicationCommands(CLIENT_ID);

      if (isClear) {
        info('🧹 Clearing global commands...');
        await rest.put(route, { body: [] });
        info(`✅ Cleared all global commands`);
      } else {
        info(`🌍 Deploying ${commands.length} global command(s)...`);
        await rest.put(route, { body: commands });
        info(`✅ Successfully deployed global commands`);
      }
    }

  } catch (error) {
    logError('❌ Error during deployment:', error);
  }
}

deploy();