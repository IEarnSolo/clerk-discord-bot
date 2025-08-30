// src/utils/competitionUtils.js
import { womClient } from '../services/womClient.js';
import { error, fullError, info, warn } from './logger.js';
import { updateCompetitionTimes } from '../services/competitionService.js';
import { MetricProps } from '@wise-old-man/utils';
import { CompetitionStatus } from '../constants/competitionStatus.js';
import { parseDate } from './timezoneUtils.js';
import { get, run } from '../services/databaseService.js';
import { MAIN_COLOR, WOM_COMPETITION_BASE_URL } from '../config.js';
import { DateTime } from 'luxon';
import { EmbedBuilder } from "discord.js";

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

export async function createHostedCompetition(comp, pollWinner, settings) {
  // Calculate start & end times
  const todayStr = new Date().toLocaleDateString('en-US');
  const startingHourStr = comp.starting_hour || '12:00pm';
  let startDT = parseDate(todayStr, startingHourStr, 'ET');
  if (!startDT) {
    console.warn(`Invalid starting_hour "${startingHourStr}" for guild ${comp.guild_id}, defaulting to 12:00pm ET`);
    startDT = parseDate(todayStr, '12:00pm', 'ET');
  }
  const afterPollDays = settings?.days_after_poll ?? 7;
  startDT = startDT.plus({ days: afterPollDays }); // How many days between poll finishing and competition starting
  const endDT = startDT.plus({ days: 7 }); // Competition length time
  const startUTC = startDT.toUTC();
  const endUTC = endDT.toUTC();

  // 🔹 Find the metric key from the display name used in poll options
  const metricKey = Object.keys(MetricProps).find(
    key => MetricProps[key].name === pollWinner.winningOption
  );

  if (!metricKey) {
    throw new Error(`No metric key found for option: ${pollWinner.winningOption}`);
  }

  // Create competition on WOM
  const newCompetition = await womClient.competitions.createCompetition({
    title: `${comp.type}: ${pollWinner.winningOption}`,
    metric: metricKey,
    startsAt: startUTC.toISO(),
    endsAt: endUTC.toISO(),
    participants: ['I Earn Solo'],
  });

    info(`Created WOM competition: ${newCompetition.competition.id} - ${newCompetition.competition.title} | verification code: ${newCompetition.verificationCode}`);

  return {
    competitionId: newCompetition.competition.id,
    title: newCompetition.competition.title,
    verificationCode: newCompetition.verificationCode,
    startsAt: startUTC.toMillis(),
    endsAt: endUTC.toMillis(),
    metricKey
  };
}

export async function createCompetitionReactMessage(
  announcementsChannel,
  guildId,
  comp,
  compType,
  pollWinner,
  clanRoleId,
  client
) {
    const emojiName = compType === 'Skill of the Week'
    ? `${comp.metricKey}_skill`
    : comp.metricKey;

  // Fetch the bot's application emojis
  await client.application.fetch();
  const appEmojis = await client.application.emojis.fetch();

  // Find the emoji by name
  const emoji = appEmojis.find(e => e.name === emojiName);

  // Fallback emoji if the custom one doesn't exist
  const emojiToReact = emoji ? emoji.toString() : '✅';

  // Convert milliseconds to seconds
  const startTimestampSec = Math.floor(comp.startsAt / 1000);

  const announceMsg = await announcementsChannel.send({
    content: `<@&${clanRoleId}>\n${emojiToReact} The next competition will be [**${comp.title}**](${WOM_COMPETITION_BASE_URL}${comp.competitionId})! ${emojiToReact}\nIt will begin <t:${startTimestampSec}:F>.\nReact to this message to be added into the competition!`,
  });

  await announceMsg.react(emojiToReact);

  const messageLink = `https://discord.com/channels/${guildId}/${announceMsg.channel.id}/${announceMsg.id}`;
  return { messageLink, emoji: emojiToReact };
}

export async function sendCompetitionReminder(comp, announcementsChannel, clanRoleId) {
  const startTime = new Date(comp.startsAt);
  const reminderTime = new Date(startTime);
  reminderTime.setDate(reminderTime.getDate() - 1);

  const now = new Date();
  if (now >= reminderTime) {
    await announcementsChannel.send({
      content: `<@&${clanRoleId}>\n⏰ Reminder: The competition ${comp.emoji} [**${comp.title}**](${WOM_COMPETITION_BASE_URL}${comp.competitionId}) ${comp.emoji} starts in 24 hours!`,
    });

    await run(
      `UPDATE competitions
       SET status = ?
       WHERE guild_id = ? AND poll_message_id = ?`,
      [CompetitionStatus.SENT_REMINDER, comp.guild_id, comp.poll_message_id]
    );
  }
}

/**
 * Send a WOM reminder
 * @param {*} comp Competition object
 * @param {*} announcementsChannel Channel to send to
 * @param {*} roleId Role ID to ping
 * @param {"before_comp_start"|"before_comp_end"} type Reminder type
 */
export async function sendWomReminder(comp, announcementsChannel, roleId, type) {
  const isStart = type === "before_comp_start";

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(isStart ? "⏰ Competition Starting Soon" : "⏰ Competition Ending Soon")
    .setDescription(
      `The competition **${comp.title}** will ${isStart ? "start" : "end"} in **30 minutes**!\n\n` +
      `Please make sure your Wise Old Man profile is updated ${isStart ? "before the competition begins" : "before the competition ends"}.\n\n` +
      `[🔗 View Competition Page](${comp.womUrl})`
    )
    .setTimestamp();

  await announcementsChannel.send({
    content:
      `<@&${roleId}>\n` +
      `The competition ${comp.emoji} [**${comp.title}**](${WOM_COMPETITION_BASE_URL}${comp.competitionId}) ${comp.emoji} will ${isStart ? "start" : "end"} in **30 minutes**!\n` +
      `Please make sure to log out and update your Wise Old Man profile ${isStart ? "before the competition begins" : "before the competition ends"}.`,
    // embeds: [embed], // uncomment if you want embed format instead of plain text
  });
}


export async function startCompetition(comp, announcementsChannel, roleId) {
  try {
    if (!announcementsChannel) return;

    await announcementsChannel.send({
      content: `<@&${roleId}>\n${comp.emoji} [**${comp.title}**](${WOM_COMPETITION_BASE_URL}${comp.competitionId}) ${comp.emoji} has officially started!\n\nGood luck to everyone competing!`,
    });

    await run(
      `UPDATE competitions 
       SET status = ? 
       WHERE competitionId = ?`,
      [CompetitionStatus.COMPETITION_STARTED, comp.competitionId]
    );

    info(`[Scheduler] Competition ${comp.title} started successfully.`);
  } catch (err) {
    fullError(`[Scheduler] Failed to start comp ${comp.title}:`, err);
  }
}

export async function endCompetition(comp, announcementsChannel, roleId) {
  try {
    // Fetch full competition details from WOM API
    const womComp = await womClient.competitions.getCompetitionDetails(comp.competitionId);

    // Extract top 3 winners by gained progress
    const winners = womComp.participations
      .filter(p => p.progress && p.progress.gained > 0)
      .sort((a, b) => b.progress.gained - a.progress.gained)
      .slice(0, 3);

    // Build winners message
    let winnersMsg = winners
      .map((w, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
        if (comp.type === "Skill of the Week") {
          return `${medal} ${w.player.displayName} - ${w.progress.gained.toLocaleString()} XP`;
        } else if (comp.type === "Boss of the Week") {
          const kills = w.progress.gained;
          const killLabel = kills === 1 ? "kill" : "kills";
          return `${medal} ${w.player.displayName} - ${kills.toLocaleString()} ${killLabel}`;
        } else {
          return `${medal} ${w.player.displayName} - ${w.progress.gained.toLocaleString()}`;
        }
      })
      .join("\n");

    if (!winnersMsg) {
      winnersMsg = "No participants gained progress during this competition.";
    }

    // Announce results with content + embed
    if (announcementsChannel) {
      await announcementsChannel.send({
        content: `<@&${roleId}>\n${comp.emoji} **${comp.title}** ${comp.emoji} has finished!`,
        embeds: [
          {
            title: `🏆 Winners of ${comp.title}`,
            url: `${WOM_COMPETITION_BASE_URL}${comp.competitionId}`,
            description: winnersMsg,
            color: MAIN_COLOR,
          },
        ],
      });
    }

    // Update DB row to finished
    await run(
      `UPDATE competitions 
       SET status = ? 
       WHERE competitionId = ? AND guild_id = ?`,
      [CompetitionStatus.COMPETITION_FINISHED, comp.competitionId, comp.guild_id]
    );

    // 🔹 Append metric to last_chosen_metric in competition_settings
    const row = await get(
      `SELECT last_chosen_metric 
       FROM competition_settings 
       WHERE guild_id = ?`,
      [comp.guild_id]
    );

    if (row) {
      let updatedMetrics = row.last_chosen_metric
        ? row.last_chosen_metric.split(",").map(m => m.trim())
        : [];

      // Avoid duplicate entries (optional, remove if you want duplicates)
      if (!updatedMetrics.includes(comp.metric)) {
        updatedMetrics.push(comp.metric);
      }

      await run(
        `UPDATE competition_settings
         SET last_chosen_metric = ?
         WHERE guild_id = ?`,
        [updatedMetrics.join(","), comp.guild_id]
      );
    }
  } catch (err) {
    console.error(`Failed to fetch results for competition ${comp.competitionId}:`, err);
  }
}

/**
 * Determine the current competition status based on stored times.
 * 
 * @param {Object} comp - Competition object from DB
 * @param {number} comp.startsAt - start time in ms
 * @param {number} comp.endsAt - end time in ms
 * @returns {number} CompetitionStatus enum value
 */
export function getCompetitionStatus(comp) {
  const now = DateTime.now();
  const startsAt = DateTime.fromMillis(comp.startsAt);
  const endsAt = DateTime.fromMillis(comp.endsAt);

  /* // If competition has ended
  if (now >= endsAt) {
    return CompetitionStatus.COMPETITION_FINISHED;
  } */
 
 // If competition is ongoing
  if (now >= startsAt && now < endsAt) {
    return CompetitionStatus.COMPETITION_STARTED;
  }

  // If before competition starts
  const oneDayBeforeStart = startsAt.minus({ days: 1 });

  if (now >= oneDayBeforeStart && now < startsAt) {
    return CompetitionStatus.SENT_REMINDER;
  }

  if (now < oneDayBeforeStart) {
    return CompetitionStatus.POLL_FINISHED;
  }

  // Default fallback (shouldn’t hit)
  return comp.status;
}