// src/services/competitionService.js
import { get, run, all } from '../services/databaseService.js';
import { info, error as logError } from '../utils/logger.js';

/**
 * Find a competition by its unique competition ID.
 * @param {string} competitionId - The unique competition ID
 * @returns {Promise<Object|null>} - The competition record or null if not found
 */
export async function findCompetitionById(competitionId) {
  return await get(
    `SELECT * FROM competitions WHERE competitionId = ?`,
    [competitionId]
  );
}

/**
 * Find a competition by its Discord message link.
 * @param {string} messageLink - The Discord message link
 * @returns {Promise<Object|null>} - The competition record or null if not found
 */
export async function getCompetitionByMessageLink(messageLink) {
  try {
    return await get(
      `SELECT * FROM competitions WHERE messageLink = ?`,
      [messageLink]
    );
  } catch (err) {
    logError(`Error fetching competition by message link: ${err.message}`);
    return null;
  }
}

/**
 * Find all competitions for a specific guild.
 * @param {string} guildId - The Discord guild ID
 * @returns {Promise<Array>} - Array of competition records
 */
export async function findAllCompetitions(guildId) {
  return await all(
    `
    SELECT competitionId, title, startsAt, endsAt, messageLink, emoji
    FROM competitions
    WHERE guild_id = ?
    AND competitionId IS NOT NULL
    `,
    [guildId]
  );
}

/**
 * Insert a new competition into the database.
 * @param {Object} competition - Competition details
 */
export async function insertCompetition({
  guildId,
  competitionId,
  messageLink,
  verificationCode,
  emoji,
  title,
  metric,
  startsAt,
  endsAt
}) {
  await run(
    `INSERT INTO competitions (guild_id, competitionId, messageLink, verificationCode, emoji, title, metric, startsAt, endsAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, competitionId, messageLink, verificationCode, emoji, title, metric, startsAt, endsAt]
  );
  info(`Inserted new competition ${competitionId} into DB for guild ${guildId}.`);
}

/**
 * Update the message link and emoji for a competition.
 * @param {string} competitionId - The unique competition ID
 * @param {string} messageLink - The new Discord message link
 * @param {string} emoji - The reaction emoji for the competition
 */
export async function updateCompetitionLink(competitionId, messageLink, emoji) {
  await run(
    `UPDATE competitions SET messageLink = ?, emoji = ? WHERE competitionId = ?`,
    [messageLink, emoji, competitionId]
  );
  info(`Updated competition ${competitionId} link in DB.`);
}

export async function updateCompetitionTimes(updatedCompetition) {
    const { competitionId, startsAt, endsAt } = updatedCompetition;

    try {
        await run(
            `UPDATE competitions SET startsAt = ?, endsAt = ? WHERE competitionId = ?;`,
            [startsAt, endsAt, competitionId]
        );
        info(`Database updated for competition ID: ${competitionId}`);
    } catch (err) {
        logError(`Failed to update competition ${competitionId}: ${err.message}`);
    }
}

export async function getCompetitionChannels(client, guildId) {
  const channelSettings = await get(
    `SELECT event_planning_channel_id, announcements_channel_id 
     FROM channel_settings 
     WHERE guild_id = ?`,
    [guildId]
  );

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { guild: null, eventChannel: null, announcementsChannel: null };

  const eventChannel = await guild.channels.fetch(channelSettings?.event_planning_channel_id).catch(() => null);
  const announcementsChannel = await guild.channels.fetch(channelSettings?.announcements_channel_id).catch(() => null);

  return { guild, eventChannel, announcementsChannel };
}

/**
 * Update competition status.
 */
export async function updateCompetitionStatus(competitionId, status) {
  try {
    await run(
      `UPDATE competitions SET status = ? WHERE competitionId = ?`,
      [status, competitionId]
    );
    info(`Updated competition ${competitionId} status -> ${status}`);
  } catch (err) {
    logError(`Failed to update competition status: ${err.message}`);
  }
}

/**
 * Get active competition by status (e.g. POLL_STARTED, COMPETITION_STARTED).
 */
export async function getCompetitionsByStatus(status) {
  return await all(
    `SELECT * FROM competitions WHERE status = ?`,
    [status]
  );
}

/**
 * Insert a hosted competition row with poll data (for automation tracking).
 * Only stores what we need now: guild_id, type, starting_hour, poll_message_id, status.
 */
export async function insertCompetitionPoll({
  guild_id,
  type,
  starting_hour,
  poll_message_id,
  status
}) {
  await run(
    `INSERT INTO competitions (guild_id, type, starting_hour, poll_message_id, status)
     VALUES (?, ?, ?, ?, ?)`,
    [guild_id, type, starting_hour, poll_message_id, status]
  );
  info(`Inserted hosted competition poll data for guild ${guild_id} (${type})`);
}


export async function setCompetitionData(comp, hostedComp, messageLink, emoji) {
  await run(
    `UPDATE competitions
     SET competitionId = ?,
         title = ?,
         metric = ?,
         verificationCode = ?,
         startsAt = ?,
         endsAt = ?,
         messageLink = ?,
         emoji = ?
     WHERE guild_id = ? AND poll_message_id = ?`,
    [
      hostedComp.competitionId,
      hostedComp.title,
      hostedComp.metricKey,
      hostedComp.verificationCode,
      hostedComp.startsAt,
      hostedComp.endsAt,
      messageLink,
      emoji,
      comp.guild_id,
      comp.poll_message_id
    ]
  );

  // Fetch the updated row and return it
  const updatedComp = await get(
    `SELECT * FROM competitions WHERE guild_id = ? AND poll_message_id = ?`,
    [comp.guild_id, comp.poll_message_id]
  );

  return updatedComp;
}

/**
 * Fetch a competition row by poll_message_id.
 */
export async function getCompetitionByPollMessageId(pollMessageId) {
  return await get(
    `SELECT * FROM competitions WHERE poll_message_id = ?`,
    [pollMessageId]
  );
}

export async function findCompetitionByPollId(pollId) {
  try {
    const comp = await get(
      `SELECT * FROM competitions WHERE poll_message_id = ? OR tiebreaker_poll_message_id = ?`,
      [pollId, pollId]
    );
    if (!comp) {
      info(`No competition found for poll ID ${pollId}`);
    } else {
      info(`Competition found for poll ID ${pollId}`);
    }
    return comp;
  } catch (err) {
    logError(`Error fetching competition by poll ID ${pollId}:`, err);
    return null;
  }
}

export async function updateCompetitionStatusAndPoll(guildId, pollMessageId, status, tiebreakerPollId = null) {
  const sql = `
    UPDATE competitions
    SET status = ?, tiebreaker_poll_message_id = COALESCE(?, tiebreaker_poll_message_id)
    WHERE guild_id = ? AND (poll_message_id = ? OR tiebreaker_poll_message_id = ?)
  `;
  await run(sql, [status, tiebreakerPollId, guildId, pollMessageId, pollMessageId]);
}

/**
 * Delete a competition from the database.
 * @param {string} competitionId - The unique competition ID
 */
export async function deleteCompetition(competitionId) {
  await run(
    `DELETE FROM competitions WHERE competitionId = ?`,
    [competitionId]
  );
  info(`Competition ${competitionId} removed from DB.`);
}
// This service manages competitions in the database.
// It provides functions to find, insert, update, and delete competitions.