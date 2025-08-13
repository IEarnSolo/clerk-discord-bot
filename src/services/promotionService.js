import { get, all, run } from '../services/databaseService.js';
import { info, error as logError } from '../utils/logger.js';

/**
 * Find all promotions for a player in a given guild by any of their known names.
 * @param {string} guildId - Discord guild ID
 * @param {string[]} names - All known player names (lowercase)
 * @returns {Promise<Array>}
 */
export async function findPromotionsByNames(guildId, names) {
  try {
    if (!names.length) return [];

    const placeholders = names.map(() => '?').join(',');
    const params = [guildId, ...names];

    return await all(
      `
      SELECT date, timestamp, beforeRank, afterRank, rsn
      FROM promotions
      WHERE guild_id = ? 
      AND LOWER(rsn) IN (${placeholders})
      ORDER BY timestamp ASC
      `,
      params
    );
  } catch (err) {
    logError(`Error fetching promotions for guild ${guildId}: ${err.message}`);
    throw err;
  }
}

/**
 * Find distinct promotion names for the latest promotion entries in a guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string[]>}
 */
export async function findDistinctPromotionNames(guildId) {
  try {
    const rows = await all(
      `SELECT p.rsn
       FROM promotions p
       INNER JOIN (
         SELECT LOWER(rsn) AS lower_rsn, MAX(timestamp) AS max_timestamp
         FROM promotions
         WHERE guild_id = ?
         GROUP BY lower_rsn
       ) latest
       ON LOWER(p.rsn) = latest.lower_rsn AND p.timestamp = latest.max_timestamp
       ORDER BY p.rsn COLLATE NOCASE ASC`,
      [guildId]
    );

    return rows.map(row => row.rsn);

  } catch (err) {
    throw err;
  }
}

/** Insert a new promotion record, ignoring duplicates.
 * @param {string} guildId - Discord guild ID
 * @param {string} rsn - Player's in-game name
 * @param {string} promotionDate - Date of promotion (YYYY-MM-DD)
 * @param {number} timestamp - Unix timestamp of promotion
 * @param {string} beforeRank - Rank before promotion
 * @param {string} afterRank - Rank after promotion
 */
export async function insertPromotionData(guildId, rsn, promotionDate, timestamp, beforeRank, afterRank) {
  if (beforeRank === afterRank) {
    info(`Both beforeRank (${beforeRank}) and afterRank (${afterRank}) match for ${rsn} in Guild: ${guildId}. Skipping insert.`);
    return;
  }

  try {
    const result = await run(
      `INSERT OR IGNORE INTO promotions (guild_id, rsn, date, timestamp, beforeRank, afterRank)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [guildId, rsn, promotionDate, timestamp, beforeRank, afterRank]
    );

    if (result.changes === 0) {
      info(`Duplicate entry found for Guild: ${guildId}, RSN: ${rsn}, Date: ${promotionDate}. Skipping insert.`);
    } else {
      info(`Promotion data inserted for Guild: ${guildId}, RSN: ${rsn}: Before Rank - ${beforeRank}, After Rank - ${afterRank}`);
    }
  } catch (err) {
    throw new Error(`Failed to insert promotion data: ${err.message}`);
  }
}