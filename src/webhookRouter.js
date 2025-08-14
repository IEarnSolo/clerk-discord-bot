// src/webhookRouter.js
import { handle as handleOnlinePlayers } from './webhooks/onlinePlayersWebhook.js';
import { handle as handleClanLink } from './webhooks/clanLinkWebhook.js';
import { handle as handleCreateRole } from './webhooks/createRoleWebhook.js';
import { handle as handleUpdateRank } from './webhooks/updateRankWebhook.js';

/**
 * Registers webhook routes on the given Express app.
 * @param {import('express').Express} app - The Express application
 * @param {import('discord.js').Client} client - The Discord client
 */
export function registerWebhookRoutes(app, client) {
  app.post('/update-online-players', (req, res) => {
    handleOnlinePlayers(req, res, client);
  });

  app.post('/link-clan', (req, res) => {
    handleClanLink(req, res);
  });

  app.post('/create-role', (req, res) => {
    handleCreateRole(req, res, client);
  });
  
  app.post('/update-rank', (req, res) => {
    handleUpdateRank(req, res, client);
  });
}
