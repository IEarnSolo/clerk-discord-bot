import { get } from '../services/databaseService.js';
import { info } from '../utils/logger.js';

/**
 * Fetch a specific channel ID setting for a guild from the database.
 * @param {string} guildId - Discord guild ID
 * @param {string} columnName - The column name in channel_settings table to fetch
 * @returns {Promise<string|null>} - The channel ID or null if not set
 */
export async function getGuildChannel(guildId, columnName) {
  info(`Fetching ${columnName} for guild ID: ${guildId}`);

  try {
    const row = await get(
      `SELECT ${columnName} FROM channel_settings WHERE guild_id = ?`,
      [guildId]
    );

    return row ? row[columnName] : null;
  } catch (err) {
    throw new Error(`Error fetching ${columnName} for guild ${guildId}: ${err.message}`);
  }
}
