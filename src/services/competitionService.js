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
 * Find all competitions.
 * @returns {Promise<Array>} - Array of competition records
 */
export async function findAllCompetitions() {
  return await all(
    `SELECT competitionId, title, startsAt, endsAt, messageLink FROM competitions`
  );
}

/**
 * Insert a new competition into the database.
 * @param {Object} competition - Competition details
 */
export async function insertCompetition({
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
    `INSERT INTO competitions (competitionId, messageLink, verificationCode, emoji, title, metric, startsAt, endsAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [competitionId, messageLink, verificationCode, emoji, title, metric, startsAt, endsAt]
  );
  info(`Inserted new competition ${competitionId} into DB.`);
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