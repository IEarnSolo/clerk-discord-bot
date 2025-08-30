// src/schedulers/competitionScheduler.js
import { all, get } from '../services/databaseService.js';
import { CompetitionStatus } from '../constants/competitionStatus.js';
import { endCompetition, startCompetition,
         sendCompetitionReminder, 
         sendWomReminder} from '../utils/competitionUtils.js';
import { info, error as logError } from '../utils/logger.js';
import schedule from 'node-schedule';

export function jobExists(name) {
  return schedule.scheduledJobs[name] !== undefined;
}

export async function scheduleCompetitionJobs(comp, announcementsChannel, roleId) {
  const now = new Date();

  // Reminder 1 day before start
  const reminderTime = new Date(comp.startsAt);
  reminderTime.setDate(reminderTime.getDate() - 1);

  if (
    !jobExists(`reminder-${comp.competitionId}`) &&
    comp.status === CompetitionStatus.POLL_FINISHED &&
    reminderTime > now
  ) {
    info(`[Scheduler] Scheduling reminder job for competition "${comp.title}" at ${reminderTime.toISOString()}`);
    schedule.scheduleJob(`reminder-${comp.competitionId}`, reminderTime, () => {
      info(`[Scheduler] Executing reminder job for competition "${comp.title}"`);
      sendCompetitionReminder(comp, announcementsChannel, roleId);
    });
  }

  // 🔔 30-minute WOM reminder (before start)
  const womStartReminderTime = new Date(comp.startsAt);
  womStartReminderTime.setMinutes(womStartReminderTime.getMinutes() - 30);

  if (
    !jobExists(`wom-start-reminder-${comp.competitionId}`) &&
    (comp.status === CompetitionStatus.POLL_FINISHED || comp.status === CompetitionStatus.SENT_REMINDER) &&
    womStartReminderTime > now
  ) {
    info(`[Scheduler] Scheduling WOM start reminder job for "${comp.title}" at ${womStartReminderTime.toISOString()}`);
    schedule.scheduleJob(`wom-start-reminder-${comp.competitionId}`, womStartReminderTime, () => {
      info(`[Scheduler] Executing WOM start reminder for "${comp.title}"`);
      sendWomReminder(comp, announcementsChannel, roleId, "before_comp_start");
    });
  }

  // 🔔 30-minute WOM reminder (before end)
  const womEndReminderTime = new Date(comp.endsAt);
  womEndReminderTime.setMinutes(womEndReminderTime.getMinutes() - 30);

  if (
    !jobExists(`wom-end-reminder-${comp.competitionId}`) &&
    womEndReminderTime > now
  ) {
    info(`[Scheduler] Scheduling WOM end reminder job for "${comp.title}" at ${womEndReminderTime.toISOString()}`);
    schedule.scheduleJob(`wom-end-reminder-${comp.competitionId}`, womEndReminderTime, () => {
      info(`[Scheduler] Executing WOM end reminder for "${comp.title}"`);
      sendWomReminder(comp, announcementsChannel, roleId, "before_comp_end");
    });
  }

  // Start job
  const startTime = new Date(comp.startsAt);
  if (
    !jobExists(`start-${comp.competitionId}`) &&
    comp.status !== CompetitionStatus.COMPETITION_STARTED &&
    startTime > now
  ) {
    info(`[Scheduler] Scheduling start job for "${comp.title}" at ${startTime.toISOString()}`);
    schedule.scheduleJob(`start-${comp.competitionId}`, startTime, () => {
      info(`[Scheduler] Executing start job for "${comp.title}"`);
      startCompetition(comp, announcementsChannel, roleId);
    });
  }

  // End job
  const endTime = new Date(comp.endsAt);
  if (
    !jobExists(`end-${comp.competitionId}`) &&
    endTime > now
  ) {
    info(`[Scheduler] Scheduling end job for "${comp.title}" at ${endTime.toISOString()}`);
    schedule.scheduleJob(`end-${comp.competitionId}`, endTime, () => {
      info(`[Scheduler] Executing end job for "${comp.title}"`);
      endCompetition(comp, announcementsChannel, roleId);
    });
  }
}

export async function scheduleAllCompetitions(client) {
  info("[Scheduler] Loading competitions to reschedule...");

  const comps = await all(
    `SELECT * FROM competitions WHERE status IN (?, ?, ?)`,
    [CompetitionStatus.POLL_FINISHED, CompetitionStatus.SENT_REMINDER, CompetitionStatus.COMPETITION_STARTED]
  );

  info(`[Scheduler] Found ${comps.length} competitions to schedule`);

  for (const comp of comps) {
    try {
      const guild = await client.guilds.fetch(comp.guild_id).catch(() => null);
      if (!guild) {
        info(`[Scheduler] Guild ${comp.guild_id} not found, skipping comp ${comp.competitionId}`);
        continue;
      }

      // Fetch announcements channel from channel_settings
      const channelSettings = await get(
        `SELECT announcements_channel_id FROM channel_settings WHERE guild_id = ?`,
        [comp.guild_id]
      );

      // Fetch clan_events_role_id from competition_settings
      const competitionSettings = await get(
        `SELECT clan_events_role_id FROM competition_settings WHERE guild_id = ?`,
        [comp.guild_id]
      );

      const announcementsChannel = channelSettings?.announcements_channel_id
        ? guild.channels.cache.get(channelSettings.announcements_channel_id)
        : null;

      //info(`[Scheduler] Scheduling comp ${comp.competitionId} for guild ${comp.guild_id}`);
      await scheduleCompetitionJobs(comp, announcementsChannel, competitionSettings?.clan_events_role_id);
    } catch (err) {
      logError(`[Scheduler] Failed to schedule comp ${comp.competitionId}`, err);
    }
  }
}