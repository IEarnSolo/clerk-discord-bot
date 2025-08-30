// src/utils/pollUtils.js
import { MetricProps } from '@wise-old-man/utils';
import { CompetitionStatus } from '../constants/competitionStatus.js';
import { scheduleCompetitionJobs } from '../schedulers/competitionScheduler.js';
import { getGuildChannel } from '../services/channelSettingsService.js';
import { getCompetitionChannels, setCompetitionData, updateCompetitionStatusAndPoll } from '../services/competitionService.js';
import { all, get, run } from '../services/databaseService.js';
import { createCompetitionReactMessage, createHostedCompetition } from './competitionUtils.js';
import { info, error as logError } from './logger.js';

function getListByType(type) {
  // Build arrays of metric keys by category using MetricProps
  const entries = Object.entries(MetricProps); // [ [key, props], ... ]
  if (type === 'Skill of the Week') {
    return entries
      .filter(([, props]) => props.type === 'skill')
      .map(([key]) => key);
  }
  if (type === 'Boss of the Week') {
    return entries
      .filter(([, props]) => props.type === 'boss')
      .map(([key]) => key);
  }
  return [];
}

export function toDisplayName(metricKey) {
  // Prefer readable name from MetricProps
  const props = MetricProps[metricKey];
  return props?.name || metricKey;
}

/**
 * Build poll answers (metric options) filtered by blacklists & last chosen.
 * @param {string} type - 'Skill of the Week' | 'Boss of the Week'
 * @param {object|null} settings - row from competition_settings (may be null)
 * @param {number} count - number of answers to return (default 10)
 * @returns {Array<{ key: string, label: string }>}
 */
export function buildPollOptions(type, settings, count = 10) {
  const allOfType = getListByType(type);

  const skillBlacklist = settings?.skill_blacklist
  ? settings.skill_blacklist.split(',').map(s => s.trim())
  : [];

const bossBlacklist = settings?.boss_blacklist
  ? settings.boss_blacklist.split(',').map(s => s.trim())
  : [];


  // Handle last_chosen_metric as comma-separated list
  const lastChosenList = settings?.last_chosen_metric
    ? settings.last_chosen_metric
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const blacklist = type === 'Skill of the Week' ? skillBlacklist : bossBlacklist;
  const blacklistSet = new Set([
    ...blacklist.map(s => String(s).toLowerCase()),
    ...lastChosenList
  ]);

  const filtered = allOfType.filter(k => {
    const keyLc = String(k).toLowerCase();
    return !blacklistSet.has(keyLc);
  });

  // Shuffle (Fisher-Yates)
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }

  const chosen = filtered.slice(0, count);
  return chosen.map(key => ({ key, label: toDisplayName(key) }));
}

/**
 * Maps a list of option keys to poll answers with application emojis.
 * Assumes Skill emojis are named `${key}_skill`.
 * @param {Client} client - Discord.js client
 * @param {string[]} options - Array of option keys (e.g., ["attack", "strength"])
 * @param {string} [suffix="_skill"] - Optional emoji suffix
 * @returns {Promise<{text: string, emoji?: {id: string}}[]>}
 */
async function mapOptionsWithEmojis(client, pollOptions, suffix = '_skill') {
  await client.application.fetch();
  const appEmojis = await client.application.emojis.fetch();

  return pollOptions.map(o => {
    const emojiName = `${o.key.toLowerCase()}${suffix}`;
    const emoji = appEmojis.find(e => e.name === emojiName);

    return {
      text: o.label,
      ...(emoji ? { emoji: { id: emoji.id } } : {})
    };
  });
}

/**
 * Create a Discord Poll message.
 * NOTE: Discord polls require the bot to have permission & the guild to support polls.
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {string} type
 * @param {Array<{label: string}>} answers
 * @param {number} days
 * @returns {Promise<import('discord.js').Message>}
 */
export async function createCompetitionPoll(channel, type, answers, days, client) {
  const hours = Math.max(1, Math.floor((days ?? 7) * 24));
  //const hours = 1; // For testing
  const question =
    type === 'Boss of the Week'
      ? 'Vote for the next Boss of the Week!'
      : 'Vote for the next Skill of the Week!';

  // answers is an array of { key, label }
  const pollAnswers = await mapOptionsWithEmojis(client, answers, type === 'Skill of the Week' ? '_skill' : '');

  const message = await channel.send({
    poll: {
      question: { text: question },
      answers: pollAnswers,
      allowMultiselect: true,
      duration: hours
    }
  });

  info(`Created poll message ${message.id} in #${channel.name}`);
  return message;
}

export async function createTiebreakerPoll(client, competition, options) {
  const channelId = await getGuildChannel(competition.guild_id, 'event_planning_channel_id');
  if (!channelId) throw new Error(`No event_planning_channel_id set for guild ${competition.guild_id}`);

  const channel = await client.channels.fetch(channelId);

  const competitionSettings = await get(
        `SELECT tiebreaker_poll_duration 
        FROM competition_settings 
        WHERE guild_id = ?`,
        [competition.guild_id]
      );

  const question =
    competition.type === 'Boss of the Week'
      ? 'Tiebreaker: Vote for the next Boss of the Week!'
      : 'Tiebreaker: Vote for the next Skill of the Week!';

  // Map options to poll format
  const pollAnswers = options.map(o => ({
    text: o.label,
    ...(o.emoji ? { emoji: o.emoji } : {})
  }));

  const pollDuration = competitionSettings?.tiebreaker_poll_duration ?? 3;

  return channel.send({
    poll: {
      question: { text: question },
      answers: pollAnswers,
      duration: pollDuration * 24,
      allowMultiselect: false
    }
  });
}

export async function catchUpPolls(client, singleComp = null) {
  info('[PollScheduler] Checking for unprocessed polls...');

  if (singleComp) {
    await processCompetitionPoll(client, singleComp);
    return;
  }

  const comps = await all(
    `SELECT * FROM competitions WHERE status IN (?, ?)`,
    [CompetitionStatus.POLL_STARTED, CompetitionStatus.TIEBREAKER_POLL_STARTED]
  );

  for (const comp of comps) {
    await processCompetitionPoll(client, comp);
  }
}

async function handlePollResults(client, competition, pollMessage) {
  const options = pollMessage.poll.answers.map(a => ({
    text: a.text,
    votes: a.voteCount
  }));

  const totalVotes = options.reduce((sum, o) => sum + o.votes, 0);

  if (totalVotes === 0 && competition.status !== CompetitionStatus.TIEBREAKER_POLL_STARTED) {
    // ❌ No one voted → cancel the competition
    await run(`DELETE FROM competitions WHERE poll_message_id = ?`, [competition.poll_message_id]);
    info(`Competition "${pollMessage.poll.question.text}" deleted due to no votes.`);
    return { totalVotes, winner: null, winningOption: null, isTie: false };
  }

  const maxVotes = Math.max(...options.map(o => o.votes));
  const topChoices = options.filter(o => o.votes === maxVotes);

  if (topChoices.length === 1) {
    // ✅ Clear winner
    const winner = topChoices[0].text;
    await updateCompetitionStatusAndPoll(
      competition.guild_id,
      competition.poll_message_id,
      CompetitionStatus.POLL_FINISHED
    );
    info(`Competition "${pollMessage.poll.question.text}" poll finished with winner: ${winner}`);

    return { totalVotes, winner, winningOption: winner, isTie: false };
  } else {
    // 🤝 Tie detected → create tiebreaker poll
    const tieOptions = topChoices.map(c => {
      // c.text is the display name
      const originalOption = pollMessage.poll.answers.find(a => a.text === c.text);

      return {
        label: c.text,
        emoji: originalOption?.emoji || null
      };
    });

    try {
      const tiebreakerPoll = await createTiebreakerPoll(client, competition, tieOptions);
      await updateCompetitionStatusAndPoll(
        competition.guild_id,
        competition.poll_message_id,
        CompetitionStatus.TIEBREAKER_POLL_STARTED,
        tiebreakerPoll.id
      );
    } catch (err) {
      console.error("❌ Failed to create tiebreaker poll:", err);
    }

    const { guild, eventChannel } = await getCompetitionChannels(client, competition.guild_id);
    if (!guild || !eventChannel) return;

      try {
        const compSettings = await get(
          `SELECT clan_events_role_id FROM competition_settings WHERE guild_id = ?`,
          [competition.guild_id]
        );

        // Fetch application emojis
        await client.application.fetch();
        const appEmojis = await client.application.emojis.fetch();

        // Decide which emoji name to look for based on type
        const emojiName = competition.type === "Skill of the Week" ? "skills" : "combat";

        // Try to find the emoji by name
        const chosenEmoji = appEmojis.find(e => e.name === emojiName);

        // Fallback if emoji not found
        const emojiStr = chosenEmoji ? chosenEmoji.toString() : "📊";

        if (compSettings?.clan_events_role_id) {
          await eventChannel.send({
            content: `<@&${compSettings.clan_events_role_id}>\n${emojiStr} A tiebreaker poll has started! ${emojiStr}\nVote now for the next **${competition.type}**!`
          });
        }
      } catch (err) {
        logError(`Failed to announce clan_events_role_id ping for guild ${guild}: ${err.message}`);
      }

    info(`Competition poll: "${pollMessage.poll.question.text}" entered tiebreaker poll.`);

    return { totalVotes, winner: null, winningOption: null, isTie: true };
  }
}

export async function processCompetitionPoll(client, comp) {
  try {
    const { guild, eventChannel, announcementsChannel } = await getCompetitionChannels(client, comp.guild_id);
    if (!guild || !eventChannel) return;

    const pollMsg =
      (comp.tiebreaker_poll_message_id &&
        await eventChannel.messages.fetch(comp.tiebreaker_poll_message_id).catch(() => null)) ||
      (comp.poll_message_id &&
        await eventChannel.messages.fetch(comp.poll_message_id).catch(() => null));

    if (!pollMsg || !pollMsg.poll) return;

    if (!pollMsg.poll.resultsFinalized) return;

    info(`[PollScheduler] Processing poll ${pollMsg.id} (guild=${comp.guild_id}, status=${comp.status})`);

    const pollResults = await handlePollResults(client, comp, pollMsg);

    if (pollResults.totalVotes === 0) return;

    if (pollResults.isTie) return;

    // 🔹 Get winner
    const pollWinner = pollResults;
    if (!pollWinner) return;

    // 🔹 Create WOM competition if missing
    if (!comp.startsAt || !comp.endsAt || !comp.competitionId) {
      const competitionSettings = await get(
        `SELECT clan_events_role_id, days_after_poll 
        FROM competition_settings 
        WHERE guild_id = ?`,
        [comp.guild_id]
      );

      const hostedComp = await createHostedCompetition(comp, pollWinner, competitionSettings);

      let messageLink = null, emoji = null;
      if (announcementsChannel) {
        ({ messageLink, emoji } = await createCompetitionReactMessage(
          announcementsChannel,
          guild.id,
          hostedComp,
          comp.type,
          pollWinner,
          competitionSettings?.clan_events_role_id,
          client
        ));
      }

      const updatedComp = await setCompetitionData(comp, hostedComp, messageLink, emoji);
      comp.startsAt = hostedComp.startsAt;
      comp.endsAt = hostedComp.endsAt;

      // 🔹 Reset last_chosen_metric so next polls start fresh
      await run(
        `UPDATE competition_settings 
        SET last_chosen_metric = NULL 
        WHERE guild_id = ?`,
        [comp.guild_id]
      );
      //info(`[PollScheduler] Reset last_chosen_metric for guild ${comp.guild_id}`);


      // 🔹 Schedule jobs for this comp
      await scheduleCompetitionJobs(updatedComp, announcementsChannel, competitionSettings?.clan_events_role_id);
    }
  } catch (err) {
    logError(`[PollScheduler] Error processing competition poll: ${err.message}`);
  }
}