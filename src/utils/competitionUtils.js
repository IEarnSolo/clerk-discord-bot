// src/utils/competitionUtils.js
import { womClient } from '../services/womClient.js';
import { info, warn } from './logger.js';
import { updateCompetitionTimes } from '../services/competitionService.js';

/** * Updates competition times if they have changed.
 * Fetches the latest competition details from the WOM API
 * and compares them with the current competition data.
 * If there are changes, updates the database.
 * @param {string} competitionId - The ID of the competition to update.
 * @param {Object} currentCompetition - The current competition data from the database.
 * @return {Promise<void>}
 */
export async function updateCompetitionTimesIfChanged(competitionId, currentCompetition) {
  const latest = await womClient.competitions.getCompetitionDetails(competitionId);

  if (!latest) {
    warn(`No details found for competition ID: ${competitionId}`);
    return;
  }

  let updated = false;
  const currentStart = Number(currentCompetition.startsAt);
  const currentEnd = Number(currentCompetition.endsAt);
  const fetchedStart = new Date(latest.startsAt).getTime();
  const fetchedEnd = new Date(latest.endsAt).getTime();

  if (fetchedStart !== currentStart) {
    info(`Competition ${competitionId} start time changed. Updating DB.`);
    currentCompetition.startsAt = fetchedStart;
    updated = true;
  }
  if (fetchedEnd !== currentEnd) {
    info(`Competition ${competitionId} end time changed. Updating DB.`);
    currentCompetition.endsAt = fetchedEnd;
    updated = true;
  }

  if (updated) {
    await updateCompetitionTimes(currentCompetition);
  }
}
