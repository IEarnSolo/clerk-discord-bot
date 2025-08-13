// src/webhooks/clanLinkWebhook.js
import { get, run } from '../services/databaseService.js';
import { info, error as logError } from '../utils/logger.js';

/** Handles the clan link webhook to link a Discord guild to an OSRS clan.
 * @param {Object} req - The request object containing the verification code and clan name.
 * @param {Object} res - The response object to send back the result.
 * @param {Object} client - The Discord client to interact with the guild.
 * @returns {Promise<void>}
 */
export async function handle(req, res) {
  const { verification_code, clan_name } = req.body;

  if (!verification_code || !clan_name) {
    return res.status(400).send('Missing verification code or clan name.');
  }

  try {
    const row = await get(
      'SELECT * FROM clan_guild_links WHERE verification_code = ?',
      [verification_code]
    );

    if (!row) {
      return res.status(404).send('Verification code not found.');
    }

    const { guild_id, clan_name: currentName } = row;

    if (currentName !== clan_name) {
      // Check if the new clan name is already taken by another guild
      const nameTakenRow = await get(
        'SELECT * FROM clan_guild_links WHERE clan_name = ? AND guild_id != ?',
        [clan_name, guild_id]
      );

      if (nameTakenRow) {
        return res
          .status(409)
          .send(`Clan name "${clan_name}" is already linked to another Discord server.`);
      }

      await run(
        'UPDATE clan_guild_links SET clan_name = ? WHERE verification_code = ?',
        [clan_name, verification_code]
      );

      info(`Clan "${clan_name}" successfully linked to verification code: ${verification_code}`);
      return res.status(200).send(`Clan "${clan_name}" successfully linked.`);
    } else {
      info(`Clan "${clan_name}" already linked to verification code: ${verification_code}`);
      return res.status(200).send(`Clan "${clan_name}" successfully linked.`);
    }
  } catch (err) {
    logError('Error handling link-clan webhook:', err);
    return res.status(500).send('Internal server error.');
  }
}
// This webhook links a Discord guild to an OSRS clan using a verification code.
// It checks if the provided verification code exists and updates the clan name if necessary.
// If the clan name is already linked to another guild, it returns a conflict error.