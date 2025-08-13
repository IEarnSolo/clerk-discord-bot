// src/webhooks/createRoleWebhook.js
import { get } from '../services/databaseService.js';
import { createRankRole } from '../utils/roleUtils.js';
import { info, error as logError } from '../utils/logger.js';

/** * Handles the create role webhook to create a rank role for the Discord.
 * @param {Object} req - The request object containing the rank name and clan name.
 * @param {Object} res - The response object to send back the result.
 * @param {Object} client - The Discord client to interact with the guild.
 * @returns {Promise<void>}
 */
export async function handle(req, res, client) {
  const { rankName, clanName } = req.body;

  if (!rankName || !clanName) {
    return res.status(400).send('Missing rankName or clanName in the payload.');
  }

  try {
    const row = await get(
      'SELECT guild_id FROM clan_guild_links WHERE clan_name = ?',
      [clanName]
    );

    if (!row) {
      return res.status(404).send(`No guild linked to clan "${clanName}".`);
    }

    const guildId = row.guild_id;

    try {
      const guild = await client.guilds.fetch(guildId);
      const { role, emoji } = await createRankRole(guild, rankName, true);

      info(`Created role "${role.name}"${emoji ? ` and emoji "${emoji.name}"` : ''} for clan "${clanName}"`);
      return res.status(200).send({
        message: `Role '${role.name}'${emoji ? ` and emoji '${emoji.name}'` : ''} created successfully.`
      });
    } catch (err) {
      logError('Discord error while creating role/emoji:', err);
      return res.status(500).send('Failed to fetch guild or create role/emoji.');
    }
  } catch (err) {
    logError('Error handling createRole webhook:', err);
    return res.status(500).send('Internal server error.');
  }
}