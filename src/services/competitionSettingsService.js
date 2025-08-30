// src/services/competitionSettingsService.js
import { get, run } from '../services/databaseService.js';
import { info, error as logError } from '../utils/logger.js';

/**
 * Get competition settings for a guild.
 * @param {string} guildId - The guild ID
 */
export async function getCompetitionSettings(guildId) {
  try {
    return await get(
      `SELECT * FROM competition_settings WHERE guild_id = ?`,
      [guildId]
    );
  } catch (err) {
    logError(`Error fetching competition settings for guild ${guildId}: ${err.message}`);
    return null;
  }
}

/**
 * Insert or update competition settings for a guild.
 * @param {Object} settings - The settings object
 */
export async function upsertCompetitionSettings({
  guild_id,
  clan_events_role_id,
  skill_blacklist,
  boss_blacklist,
  last_chosen_metric,
  starting_hour
}) {
  try {
    await run(
      `INSERT INTO competition_settings (guild_id, clan_events_role_id, skill_blacklist, boss_blacklist, last_chosen_metric, starting_hour)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id) DO UPDATE SET
         clan_events_role_id = excluded.clan_events_role_id,
         skill_blacklist = excluded.skill_blacklist,
         boss_blacklist = excluded.boss_blacklist,
         last_chosen_metric = excluded.last_chosen_metric,
         starting_hour = excluded.starting_hour`,
      [guild_id, clan_events_role_id, skill_blacklist, boss_blacklist, last_chosen_metric, starting_hour]
    );
    info(`Competition settings updated for guild ${guild_id}`);
  } catch (err) {
    logError(`Failed to upsert competition settings: ${err.message}`);
  }
}
