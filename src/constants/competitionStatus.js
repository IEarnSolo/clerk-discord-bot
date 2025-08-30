// src/constants/competitionStatus.js

export const CompetitionStatus = Object.freeze({
  POLL_STARTED: 1,          // Poll has started
  TIEBREAKER_POLL_STARTED: 2, // Tiebreaker poll has started
  POLL_FINISHED: 3,      // Poll has finished, waiting for reminder
  SENT_REMINDER: 4,        // Poll ended, waiting for comp start
  COMPETITION_STARTED: 5,  // Competition has started
  COMPETITION_FINISHED: 6, // Competition has ended, winners announced
});
