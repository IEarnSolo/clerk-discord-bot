import { get, run } from '../services/databaseService.js';
import { info, error as logError } from '../utils/logger.js';

/**
 * Get the clan-guild link for a specific guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object|null>} - The clan-guild link record or null if not found
 */
export async function getGuildLink(guildId) {
  const result = await get(
    `SELECT * FROM clan_guild_links WHERE guild_id = ?`,
    [guildId]
  );
  return result || null;
}

/**
 * Get the WOM group ID linked to a specific guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} - The WOM group ID or null if not set
 */
export async function getWomGroupId(guildId) {
  const result = await get(
    `SELECT wom_group_id FROM clan_guild_links WHERE guild_id = ?`,
    [guildId]
  );
  return result?.wom_group_id || null;
}

/**
 * Insert or update the WOM group ID for a specific guild.
 * @param {string} guildId - Discord guild ID
 * @param {string|null} womGroupId - The WOM group ID to link, or null to unset
 * @returns {Promise<'inserted'|'updated'>} - Indicates whether a new record
 * was inserted or an existing one was updated
 */
export async function upsertWomGroupGuildLink(guildId, womGroupId) {
  const existing = await getGuildLink(guildId);

  if (existing) {
    await run(
      `UPDATE clan_guild_links SET wom_group_id = ? WHERE guild_id = ?`,
      [womGroupId, guildId]
    );
    info(`Updated WOM group ID for guild ${guildId} to ${womGroupId}`);
    return 'updated';
  } else {
    await run(
      `INSERT INTO clan_guild_links (guild_id, wom_group_id) VALUES (?, ?)`,
      [guildId, womGroupId]
    );
    info(`Inserted WOM group ID for guild ${guildId} to ${womGroupId}`);
    return 'inserted';
  }
}

/**
 * Get the verification code for a specific guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} - The verification code or null if not set
 */
export async function getVerificationCode(guildId) {
  const result = await get(
    `SELECT verification_code FROM clan_guild_links WHERE guild_id = ?`,
    [guildId]
  );
  return result?.verification_code || null;
}

/**
 * Insert or update the verification code for a specific guild.
 * @param {string} guildId - Discord guild ID
 * @param {string} verificationCode - The verification code to set
 */
export async function upsertVerificationCode(guildId, verificationCode) {
  await run(
    `INSERT INTO clan_guild_links (guild_id, verification_code)
     VALUES (?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET verification_code = excluded.verification_code`,
    [guildId, verificationCode]
  );
}
// This service manages the linking between Discord guilds and OSRS clans.
// It provides functions to get and upsert clan-guild links and verification codes.
// It interacts with the database to store and retrieve this information.