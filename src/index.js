// Main entry point for the bot.
// Loads commands, events, and starts the Express webhook server.

import 'dotenv/config';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { DEFAULT_PORT } from './config.js';
import { info, warn, error as logError } from './utils/logger.js';
import { registerWebhookRoutes } from './webhookRouter.js';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Command collection
client.commands = new Collection();

// Load commands dynamically from both global and dev folders
const commandsBasePath = join(__dirname, 'commands');
const commandFolders = readdirSync(commandsBasePath);

for (const folder of commandFolders) {
  const folderPath = join(commandsBasePath, folder);
  const commandFiles = readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(folderPath, file);
    const commandModule = await import(pathToFileURL(filePath));
    const command = commandModule.default || commandModule; // Support default & named exports

    const commandName = command.data?.name || command.name;

    if (!commandName) {
      warn(`⚠ Skipping command in ${filePath}: missing name`);
      continue;
    }

    client.commands.set(commandName, command);
  }
}

// Load events dynamically (ESM import)
const eventsPath = join(__dirname, 'events');
for (const file of readdirSync(eventsPath)) {
  if (file.endsWith('.js')) {
    const eventModule = await import(pathToFileURL(join(eventsPath, file)));
    const event = eventModule.default || eventModule;
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}

// Start Express server for webhooks
const app = express();
const PORT = process.env.PORT || DEFAULT_PORT;

app.use(bodyParser.json());

try {
  registerWebhookRoutes(app, client);

  app.listen(PORT, () => {
    info(`Webhook server listening on port ${PORT}`);
  });
} catch (error) {
  logError('Failed to start webhook server:', error);
}

// Login bot
client.login(process.env.BOT_TOKEN);
