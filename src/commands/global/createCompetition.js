// src/commands/createComp.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { womClient } from '../../services/womClient.js';
import { WOM_COMPETITION_BASE_URL } from '../../config.js';
import { parseDate } from '../../utils/timezoneUtils.js';
import { Metric } from '@wise-old-man/utils';
import { insertCompetition } from '../../services/competitionService.js';
import { info, error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';

export const name = 'create-competition';
export const description = 'Create a new WOM competition.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Create a WOM competition.')
  .addStringOption(option => option.setName('title').setDescription('Competition title').setRequired(true))
  .addStringOption(option =>
    option
      .setName('metric')
      .setDescription('Skill/boss to track')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option => option.setName('startdate').setDescription('Start date (MM/DD/YYYY)').setRequired(true))
  .addStringOption(option => option.setName('starttime').setDescription('Start time (e.g., 11:00am)').setRequired(true))
  .addStringOption(option => option.setName('enddate').setDescription('End date (MM/DD/YYYY)').setRequired(true))
  .addStringOption(option => option.setName('endtime').setDescription('End time (e.g., 5:00pm)').setRequired(true))
  .addStringOption(option => option.setName('timezone').setDescription('Timezone (ET, CT, MT, PT) (Defaults to ET if not provided)').setRequired(false))
  .addStringOption(option => option.setName('participants').setDescription('Additional participants (comma-separated)').setRequired(false));

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  try {
    // Get all metric names from WOM Metric enum
    const metricNames = Object.keys(Metric);

    // Filter to match the user's input
    const filtered = metricNames.filter(m =>
      m.toLowerCase().includes(focusedValue)
    );

    // Respond with up to 25 choices
    await interaction.respond(
      filtered.slice(0, 25).map(name => ({
        name: name.toLowerCase(),
        value: name
      }))
    );
  } catch (err) {
    logError(`Error fetching metric autocomplete: ${err.message}`);
    await interaction.respond([]);
  }
}

export async function execute(interaction) {
  await interaction.deferReply();

  const title = interaction.options.getString('title');
  const metricInput = interaction.options.getString('metric').toUpperCase();
  const startDate = interaction.options.getString('startdate');
  const startTime = interaction.options.getString('starttime');
  const endDate = interaction.options.getString('enddate');
  const endTime = interaction.options.getString('endtime');
  const timezone = interaction.options.getString('timezone') || 'ET';
  const participantsInput = interaction.options.getString('participants') || '';

  // Validate metric
  if (!Metric[metricInput]) {
    return interaction.editReply(`❌ Invalid metric. Please use a valid one like \`attack\`, \`defence\`, \`fishing\`, etc.`);
  }

  // Parse dates
  const startsAt = parseDate(startDate, startTime, timezone);
  const endsAt = parseDate(endDate, endTime, timezone);

  if (!startsAt || !endsAt) {
    return interaction.editReply(`❌ Invalid date/time format.\nExample: \`8/6/2025 11:00am\` with timezone \`${timezone}\`.`);
  }

  const startsAtISO = startsAt.toISO();
  const endsAtISO = endsAt.toISO();

  // Get issuer as participant
  const issuerName =
    interaction.member?.nickname?.toLowerCase().replace(/[_-]/g, ' ') ||
    interaction.member?.displayName?.toLowerCase().replace(/[_-]/g, ' ') ||
    interaction.user.username.toLowerCase().replace(/[_-]/g, ' '); 
    // Normalize the issuer name by removing underscores and dashes

  const participants = [
    issuerName,
    ...participantsInput
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
  ];

  try {
    // Create competition
    const newCompetition = await womClient.competitions.createCompetition({
      title,
      metric: Metric[metricInput],
      startsAt: startsAtISO,
      endsAt: endsAtISO,
      participants
    });

    const competitionId = newCompetition.competition.id;
    const verificationCode = newCompetition.verificationCode;
    const startsAtUnix = new Date(newCompetition.competition.startsAt).getTime();
    const endsAtUnix = new Date(newCompetition.competition.endsAt).getTime();
    info(`Competition created: ${competitionId} (${title}) verification code: ${verificationCode}`);

    // Save to DB
    await insertCompetition({
      competitionId,
      messageLink: null, // not linked yet
      verificationCode,
      emoji: null, // not linked yet
      title,
      metric: Metric[metricInput],
      startsAt: startsAtUnix,
      endsAt: endsAtUnix
    });

    // Embed reply
    const link = `${WOM_COMPETITION_BASE_URL}${competitionId}`;
    const embed = new EmbedBuilder()
      .setTitle(`Competition Created: ${title}`)
      .setURL(link)
      .setColor(MAIN_COLOR)
      .addFields(
        { name: 'Competition ID', value: `\`\`\`${competitionId}\`\`\`` },
        { name: 'Verification Code', value: `\`\`\`${verificationCode}\`\`\`` },
        { name: 'Link Command', value: `\`\`\`/link-competition competitionid:${competitionId}\`\`\`` }
      )
      .setFooter({ text: `${startDate} ${startTime} ${timezone} - ${endDate} ${endTime} ${timezone}` });

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logError(`Error creating competition: ${err.message}`);
    interaction.editReply(`❌ There was an error creating the competition: ${err.message}`);
  }
}
// This command allows users to create a new WOM competition by providing details like title, metric, start and end dates/times, timezone, and additional participants.
// It validates the metric, parses the dates, and creates the competition using the WOM API.
// If successful, it saves the competition to the database and replies with an embed containing the competition details.
// The command also includes a link command for users to easily link the competition in the future with /linkcomp.