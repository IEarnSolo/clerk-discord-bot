// src/webhooks/onlinePlayersWebhook.js
import { EmbedBuilder } from 'discord.js';
import { get } from '../services/databaseService.js';
import { getEmojiForRank } from '../utils/emojiUtils.js';
import { info, error as logError } from '../utils/logger.js';
import { MAIN_COLOR } from '../config.js';

let lastOnlinePlayersList = [];

/** Handles the online players webhook to update the list of online players in a Discord channel.
 * @param {Object} req - The request object containing the clan name and players.
 * @param {Object} res - The response object to send back the result.
 * @param {Object} client - The Discord client to interact with the guild.
 * @returns {Promise<void>}
 */
export async function handle(req, res, client) {
  const { clanName, players } = req.body;

  if (!clanName || !Array.isArray(players)) {
    return res.status(400).send('Invalid payload.');
  }

  try {
    const clanLink = await get(
      'SELECT guild_id FROM clan_guild_links WHERE clan_name = ?',
      [clanName]
    );

    if (!clanLink) {
      logError(`No guild linked for clan: ${clanName}`);
      return res.status(404).send('Clan not linked to a Discord guild.');
    }

    const guildId = clanLink.guild_id;

    const channelRow = await get(
      'SELECT online_members_channel_id FROM channel_settings WHERE guild_id = ?',
      [guildId]
    );

    if (!channelRow?.online_members_channel_id) {
      logError(`No online_members_channel_id set for guild: ${guildId}`);
      return res.status(404).send('No channel configured for online members.');
    }

    const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelRow.online_members_channel_id);
    if (!channel) {
      logError(`Channel not found in guild ${guildId}`);
      return res.status(404).send('Channel not found.');
    }

    await updateOnlinePlayersList(guildId, channel, players, client);
    return res.status(200).send('Online players list updated.');
  } catch (err) {
    logError('Error handling online players webhook:', err);
    return res.status(500).send('Internal server error.');
  }
}

/** * Updates the online players list in the specified channel.
 * @param {string} guildId - The ID of the Discord guild.
 * @param {Object} channel - The Discord channel object where the message will be updated.
 * @param {Array} onlinePlayersList - The list of online players to display.
 * @param {Object} client - The Discord client to fetch emojis.
 * @returns {Promise<void>}
 */
async function updateOnlinePlayersList(guildId, channel, onlinePlayersList, client) {
  if (JSON.stringify(onlinePlayersList) === JSON.stringify(lastOnlinePlayersList)) return;

  lastOnlinePlayersList = [...onlinePlayersList];

  const row = await get(
    'SELECT online_members_message_id FROM message_config WHERE guild_id = ?',
    [guildId]
  );

  if (!row?.online_members_message_id) {
    logError('No online players message ID found in DB.');
    return;
  }

  try {
    const message = await channel.messages.fetch(row.online_members_message_id);
    const nonGuestPlayers = onlinePlayersList.filter(p => p.rank !== 'Guest');
    onlinePlayersList.sort((a, b) => a.name.localeCompare(b.name));

    const formattedList = await Promise.all(
      onlinePlayersList.map(async (player) => {
        const emoji = await getEmojiForRank(player.rank, client);
        return `${emoji} ${player.name}`;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(MAIN_COLOR)
      .setTitle(`Online Members: ${nonGuestPlayers.length}`)
      .setDescription(formattedList.join('\n') || '*No one online*')
      .setTimestamp()
      .setFooter({ text: 'Last updated' });

    await message.edit({ embeds: [embed] });

  } catch (error) {
    logError('Error editing online players message:', error);
  }
}
// This webhook handles updates about online players in a clan.
// It fetches the appropriate Discord channel and message, then updates the message with the current list
// of online players, including emojis representing their ranks.
// It avoids unnecessary updates by checking if the list has changed since the last update.
// It also handles various error cases, such as missing configurations or Discord entities.
// The webhook expects a payload with 'clanName' and 'players' array.
// Each player object should have 'name' and 'rank' properties.
// Example payload:
// {
//   "clanName": "MyClan",
//   "players": [
//     { "name": "Player1", "rank": "Member" },
//     { "name": "Player2", "rank": "Guest" }
//   ]
// }
// The rank emojis are fetched using the getEmojiForRank utility function.
// The message is updated with an embed showing the total number of non-guest online members and a list of all online players.