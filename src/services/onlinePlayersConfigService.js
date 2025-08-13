import { get, run } from '../services/databaseService.js';
import { error as logError, info } from '../utils/logger.js';

/**
 * Get the online members message ID for a specific guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} - The message ID or null if not set
 */
export async function setOnlinePlayersMessageId(guildId, messageId) {
  try {
    const row = await get(
      `SELECT * FROM message_config WHERE guild_id = ?`,
      [guildId]
    );

    if (row) {
      await run(
        `UPDATE message_config SET online_members_message_id = ? WHERE guild_id = ?`,
        [messageId, guildId]
      );
      info(`Updated online_members_message_id for guild ${guildId}`);
    } else {
      await run(
        `INSERT INTO message_config (guild_id, online_members_message_id) VALUES (?, ?)`,
        [guildId, messageId]
      );
      info(`Inserted new online_members_message_id for guild ${guildId}`);
    }
  } catch (err) {
    logError(`Error setting online_members_message_id for guild ${guildId}: ${err.message}`);
    throw err;
  }
}

/**
 * Set the online members channel ID for a specific guild.
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - The channel ID to set
 * @returns {Promise<void>}
 */
export async function setOnlineMembersChannelId(guildId, channelId) {
  try {
    const row = await get(
      `SELECT * FROM channel_settings WHERE guild_id = ?`,
      [guildId]
    );

    if (row) {
      await run(
        `UPDATE channel_settings SET online_members_channel_id = ? WHERE guild_id = ?`,
        [channelId, guildId]
      );
      info(`Updated online_members_channel_id for guild ${guildId}`);
    } else {
      await run(
        `INSERT INTO channel_settings (guild_id, online_members_channel_id) VALUES (?, ?)`,
        [guildId, channelId]
      );
      info(`Inserted new online_members_channel_id for guild ${guildId}`);
    }
  } catch (err) {
    logError(`Error setting online_members_channel_id for guild ${guildId}: ${err.message}`);
    throw err;
  }
}
