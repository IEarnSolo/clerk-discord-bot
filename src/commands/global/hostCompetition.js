// src/commands/hostCompetition.js
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { MAIN_COLOR } from '../../config.js';
import { CompetitionStatus } from '../../constants/competitionStatus.js';
import { getGuildChannel } from '../../services/channelSettingsService.js';
import { insertCompetitionPoll } from '../../services/competitionService.js';
import { getCompetitionSettings } from '../../services/competitionSettingsService.js';
import { get } from '../../services/databaseService.js';
import { combatEmoji, skillsEmoji } from '../../utils/emojiUtils.js';
import { info, error as logError } from '../../utils/logger.js';
import { buildPollOptions, createCompetitionPoll } from '../../utils/pollUtils.js';

export const name = 'host-competition';
export const description = 'Start an automated Skill/Boss of the Week poll and store its state.';

export const data = new SlashCommandBuilder()
  .setName('host-competition')
  .setDescription(description)
  .addStringOption(opt =>
    opt
      .setName('type')
      .setDescription('Choose "Skill of the Week" or "Boss of the Week"')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt
      .setName('starting_hour')
      .setDescription('Competition start time (e.g., 2:00pm, 11:35am, 5:30pm, 10am)')
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt
      .setName('poll_days')
      .setDescription('Poll length in days (default 7)')
      .setRequired(false)
  )
  .addStringOption(opt =>
  opt.setName('first_place_prize')
    .setDescription('1st place prize (e.g. 10m, 5m + item)')
    .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('second_place_prize')
      .setDescription('2nd place prize')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('third_place_prize')
      .setDescription('3rd place prize')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('pet_prize')
      .setDescription('Prize for obtaining the pet')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('most_levels_prize')
      .setDescription('Prize for most levels gained (SOTW only)')
      .setRequired(false)
  );

export async function autocomplete(interaction) {
  // Only one autocompleted field (type)
  const focused = interaction.options.getFocused(true);
  if (focused?.name !== 'type') {
    await interaction.respond([]);
    return;
  }

  const choices = ['Skill of the Week', 'Boss of the Week'];
  const q = (focused.value || '').toLowerCase();
  const filtered = choices
    .filter(label => label.toLowerCase().includes(q))
    .slice(0, 25)
    .map(label => ({ name: label, value: label }));

  await interaction.respond(filtered);
}

function normalizeHour(input) {
  const cleaned = String(input).trim().toLowerCase().replace(/\s+/g, '');
  const match = cleaned.match(/^([1-9]|1[0-2])(:([0-5][0-9]))?(am|pm)$/);

  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let minutes = match[3] || '00'; // default to 00 if not provided
  const suffix = match[4];

  // Always return in hh:mmam/pm format
  return `${hour}:${minutes}${suffix}`;
}

export async function execute(interaction) {
  await interaction.deferReply();
  const guild = interaction.guild;
  const guildId = guild?.id;

  if (!guildId) {
    return interaction.editReply('❌ Could not identify this guild.');
  }

  const type = interaction.options.getString('type'); // 'Skill of the Week' | 'Boss of the Week'
  const startingHourRaw = interaction.options.getString('starting_hour');
  const pollDays = interaction.options.getInteger('poll_days') ?? 7;
  const firstPlacePrize = interaction.options.getString('first_place_prize');
  const secondPlacePrize = interaction.options.getString('second_place_prize');
  const thirdPlacePrize = interaction.options.getString('third_place_prize');
  const petPrize = interaction.options.getString('pet_prize');
  const mostLevelsPrize = interaction.options.getString('most_levels_prize');

  if (type !== 'Skill of the Week' && mostLevelsPrize !== null) {
    return interaction.editReply('❌ The "most levels gained" prize can only be used for Skill of the Week competitions.');
  }

  // Validate starting hour
  const startingHour = normalizeHour(startingHourRaw);
  if (!startingHour) {
    return interaction.editReply('❌ Invalid starting hour. Use formats like `2pm`, `11am`, or `5pm`.');
  }

  // Fetch target channel ID
  let planningChannelId;
  try {
    planningChannelId = await getGuildChannel(guildId, 'event_planning_channel_id');
  } catch (err) {
    logError(`Failed fetching planning channel for guild ${guildId}: ${err.message}`);
    return interaction.editReply('❌ Error fetching your planning channel configuration.');
  }

  if (!planningChannelId) {
    return interaction.editReply('❌ No `event_planning_channel_id` is configured for this server.');
  }

  const channel =
    guild.channels.cache.get(planningChannelId) ??
    (await guild.channels.fetch(planningChannelId).catch(() => null));

  if (!channel || !channel.isTextBased?.()) {
    return interaction.editReply('❌ Could not access the event planning channel.');
  }

  // Load competition settings (blacklists, last chosen)
  const settings = await getCompetitionSettings(guildId).catch(err => {
    logError(`getCompetitionSettings error: ${err.message}`);
    return null;
  });

  // Build poll options (10 by default), filtered by type/blacklists/last chosen
  let pollOptions;
  try {
    pollOptions = buildPollOptions(type, settings, 10);
  } catch (err) {
    logError(`buildPollOptions failed: ${err.message}`);
    return interaction.editReply('❌ Failed to build poll options.');
  }

  if (pollOptions.length < 2) {
    return interaction.editReply('❌ Not enough available options to create a poll. Adjust your blacklists/settings.');
  }

  // Create the poll
  let pollMessage;
  try {
    pollMessage = await createCompetitionPoll(channel, type, pollOptions, pollDays, interaction.client);
  } catch (err) {
    logError(`createCompetitionPoll error: ${err.message}`);
    return interaction.editReply('❌ Failed to create the poll. Make sure the bot can create polls in that channel.');
  }

  try {
    const compSettings = await get(
      `SELECT clan_events_role_id FROM competition_settings WHERE guild_id = ?`,
      [guildId]
    );

    if (compSettings?.clan_events_role_id) {
      // Fetch application emojis
      await interaction.client.application.fetch();
      const appEmojis = await interaction.client.application.emojis.fetch();

      // Decide which emoji name to look for based on type
      const emojiName = type === "Skill of the Week" ? "skills" : "combat";

      // Try to find the emoji by name
      const chosenEmoji = appEmojis.find(e => e.name === emojiName);

      // Fallback if emoji not found
      const emojiStr = chosenEmoji ? chosenEmoji.toString() : "📊";

      await channel.send({
        content: `<@&${compSettings.clan_events_role_id}>\n${emojiStr} A new competition poll has started! ${emojiStr}\nVote now for the next **${type}**!`
      });
    }
  } catch (err) {
    logError(
      `Failed to announce clan_events_role_id ping for guild ${guildId}: ${err.message}`
    );
  }


  // Persist a bare-bones competition row (for automation tracking)
  try {
    await insertCompetitionPoll({
      guild_id: guildId,
      type,
      starting_hour: startingHour,
      poll_message_id: pollMessage.id,
      status: CompetitionStatus.POLL_STARTED,
      first_place_prize: firstPlacePrize,
      second_place_prize: secondPlacePrize,
      third_place_prize: thirdPlacePrize,
      pet_prize: petPrize,
      most_levels_prize: mostLevelsPrize
    });
  } catch (err) {
    logError(`insertCompetitionPoll error: ${err.message}`);
    // We won’t delete the poll; just report the DB issue
    return interaction.editReply('⚠️ Poll created, but failed to store state in the database.');
  }

  info(`[HostCompetition] Poll created for guild ${guildId} (${type}) | poll message id: ${pollMessage.id}`);
  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle('Competition Poll Created')
    .addFields(
      { name: 'Type', value: `${type === 'Skill of the Week' ? skillsEmoji : combatEmoji} ${type}`, inline: true },
      { name: 'Poll Duration', value: `${pollDays} day${pollDays === 1 ? '' : 's'}`, inline: true },
      { name: 'Start Hour', value: `${startingHour}`, inline: true },
      { 
        name: 'Poll Link', 
        value: `[Jump to poll](${pollMessage.url})`, 
        inline: false 
      }
    );

  // --- Add prizes if any exist ---
  const prizeLines = [];

  if (firstPlacePrize) prizeLines.push(`🥇 1st: ${firstPlacePrize}`);
  if (secondPlacePrize) prizeLines.push(`🥈 2nd: ${secondPlacePrize}`);
  if (thirdPlacePrize) prizeLines.push(`🥉 3rd: ${thirdPlacePrize}`);
  if (petPrize) prizeLines.push(`🐾 Pet: ${petPrize}`);
  if (mostLevelsPrize && type === 'Skill of the Week') {
    prizeLines.push(`📈 Most Levels: ${mostLevelsPrize}`);
  }

  if (prizeLines.length > 0) {
    embed.addFields({
      name: 'Prizes',
      value: prizeLines.join('\n'),
      inline: false
    });
  }

  return interaction.editReply({ embeds: [embed] });
}