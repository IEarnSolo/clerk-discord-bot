// src/commands/editCompTime.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { womClient } from '../../services/womClient.js';
import { WOM_COMPETITION_BASE_URL, MAIN_COLOR } from '../../config.js';
import { parseDate } from '../../utils/timezoneUtils.js';
import { run, get, all } from '../../services/databaseService.js';
import { DateTime } from 'luxon';
import { info, error as logError } from '../../utils/logger.js';
import schedule from 'node-schedule';
import { scheduleAllCompetitions } from '../../schedulers/competitionScheduler.js';
import { getCompetitionStatus } from '../../utils/competitionUtils.js';

export const name = 'edit-competition-time';
export const description = 'Edit the start/end times of an existing WOM competition.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(description)
  .addStringOption(option =>
    option.setName('title')
      .setDescription('Select a competition')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option => option.setName('start_date').setDescription('New start date (MM/DD/YYYY)').setRequired(false).setAutocomplete(true))
  .addStringOption(option => option.setName('start_time').setDescription('New start time (e.g., 11:00am)').setRequired(false).setAutocomplete(true))
  .addStringOption(option => option.setName('end_date').setDescription('New end date (MM/DD/YYYY)').setRequired(false).setAutocomplete(true))
  .addStringOption(option => option.setName('end_time').setDescription('New end time (e.g., 5:00pm)').setRequired(false).setAutocomplete(true))
  .addStringOption(option => option.setName('timezone').setDescription('Timezone (ET, CT, MT, PT)').setRequired(false));

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guildId;

  try {
    if (focused.name === 'title') {
      const comps = await all(
        `SELECT competitionId, title 
         FROM competitions 
         WHERE guild_id = ? 
         AND competitionId IS NOT NULL
         ORDER BY competitionId DESC 
         LIMIT 25`,
        [guildId]
      );

      return interaction.respond(
        comps.map(c => ({
          name: `${c.title} (ID: ${c.competitionId})`,
          value: String(c.competitionId)
        }))
      );
    } else {
      // Stop autocomplete if user typed anything
      if (focused.value && focused.value.length > 0) {
        return interaction.respond([]);
      }

      // Grab the currently selected competitionId from the 'title' option
      const compId = interaction.options.getString('title');
      if (!compId) return interaction.respond([]);

      // Always re-fetch based on the current compId
      const comp = await get(
        `SELECT startsAt, endsAt 
         FROM competitions 
         WHERE competitionId = ? AND guild_id = ?`,
        [compId, guildId]
      );
      if (!comp) return interaction.respond([]);

      const starts = new Date(comp.startsAt);
      const ends = new Date(comp.endsAt);

      const startDate = DateTime.fromJSDate(starts).toFormat('M/d/yyyy');
      const startTime = DateTime.fromJSDate(starts).toFormat('h:mma').toLowerCase();
      const endDate = DateTime.fromJSDate(ends).toFormat('M/d/yyyy');
      const endTime = DateTime.fromJSDate(ends).toFormat('h:mma').toLowerCase();

      let suggestions = [];
      if (focused.name === 'start_date') suggestions = [{ name: startDate, value: startDate }];
      if (focused.name === 'start_time') suggestions = [{ name: startTime, value: startTime }];
      if (focused.name === 'end_date') suggestions = [{ name: endDate, value: endDate }];
      if (focused.name === 'end_time') suggestions = [{ name: endTime, value: endTime }];

      return interaction.respond(suggestions);
    }
  } catch (err) {
    logError(`Error in autocomplete: ${err.message}`);
    return interaction.respond([]);
  }
}

export async function execute(interaction) {
  await interaction.deferReply();

  const guildId = interaction.guildId;
  const compId = interaction.options.getString('title');
  const startDateInput = interaction.options.getString('start_date');
  const startTimeInput = interaction.options.getString('start_time');
  const endDateInput = interaction.options.getString('end_date');
  const endTimeInput = interaction.options.getString('end_time');
  const timezone = interaction.options.getString('timezone') || 'ET';

  const comp = await get(
    `SELECT * FROM competitions WHERE competitionId = ? AND guild_id = ?`,
    [compId, guildId]
  );
  if (!comp) {
    return interaction.editReply(`❌ Competition with ID \`${compId}\` not found in this server.`);
  }

  // Load current values from DB
  const currentStarts = DateTime.fromMillis(comp.startsAt);
  const currentEnds = DateTime.fromMillis(comp.endsAt);

  // Build new start values
  const newStartDate = startDateInput || currentStarts.toFormat('M/d/yyyy');
  const newStartTime = startTimeInput || currentStarts.toFormat('h:mma').toLowerCase();
  const newEndDate = endDateInput || currentEnds.toFormat('M/d/yyyy');
  const newEndTime = endTimeInput || currentEnds.toFormat('h:mma').toLowerCase();

  // Parse combined values
  const startsAt = parseDate(newStartDate, newStartTime, timezone);
  const endsAt = parseDate(newEndDate, newEndTime, timezone);

  if (!startsAt || !endsAt) {
    return interaction.editReply(`❌ Invalid date/time format.`);
  }

  try {
    // Call WOM API with updated times
    await womClient.competitions.editCompetition(
      compId,
      {
        startsAt: startsAt.toISO(),
        endsAt: endsAt.toISO()
      },
      comp.verificationCode
    );

    // Update DB
    await run(
      `UPDATE competitions SET startsAt = ?, endsAt = ? WHERE competitionId = ? AND guild_id = ?`,
      [startsAt.toMillis(), endsAt.toMillis(), compId, guildId]
    );

    // 🔹 Refresh comp from DB to get updated times
    const updatedComp = await get(
      `SELECT * FROM competitions WHERE competitionId = ? AND guild_id = ?`,
      [compId, guildId]
    );

    // Cancel existing scheduled jobs for this comp
    const reminderJob = schedule.scheduledJobs[`reminder-${compId}`];
    if (reminderJob) {
      info(`[Scheduler] Canceling old reminder job for competition ${compId}`);
      reminderJob.cancel();
    }

    // Cancel existing scheduled jobs for this comp
    const womStartReminderJob = schedule.scheduledJobs[`wom-start-reminder-${compId}`];
    if (womStartReminderJob) {
      info(`[Scheduler] Canceling old WOM reminder job for competition ${compId}`);
      womStartReminderJob.cancel();
    }

    // Cancel existing scheduled jobs for this comp
    const womEndReminderJob = schedule.scheduledJobs[`wom-end-reminder-${compId}`];
    if (womEndReminderJob) {
      info(`[Scheduler] Canceling old WOM reminder job for competition ${compId}`);
      womEndReminderJob.cancel();
    }

    // Cancel existing scheduled jobs for this comp
    const startJob = schedule.scheduledJobs[`start-${compId}`];
    if (startJob) {
      info(`[Scheduler] Canceling old start job for competition ${compId}`);
      startJob.cancel();
    }

    const endJob = schedule.scheduledJobs[`end-${compId}`];
    if (endJob) {
      info(`[Scheduler] Canceling old end job for competition ${compId}`);
      endJob.cancel();
    }

    const status = getCompetitionStatus(updatedComp);
    await run(
    `UPDATE competitions SET status = ? WHERE competitionId = ? AND guild_id = ?`,
    [status, compId, guildId]
    );

    // Re-schedule everything
    await scheduleAllCompetitions(interaction.client);

    const link = `${WOM_COMPETITION_BASE_URL}${compId}`;
    const embed = new EmbedBuilder()
      .setTitle(`Competition Updated: ${comp.title}`)
      .setURL(link)
      .setColor(MAIN_COLOR)
      .setFooter({ text: `${newStartDate} ${newStartTime} ${timezone} - ${newEndDate} ${newEndTime} ${timezone}` });

    await interaction.editReply({ embeds: [embed] });

    info(`Competition ${compId} updated for guild ${guildId}.`);
  } catch (err) {
    logError(`Error editing competition: ${err.message}`);
    interaction.editReply(`❌ Failed to update competition: ${err.message}`);
  }
}