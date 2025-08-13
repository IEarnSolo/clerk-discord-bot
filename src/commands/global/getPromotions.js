import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { womClient } from '../../services/womClient.js';
import { findPromotionsByNames } from '../../services/promotionService.js';
import { error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';
import { findDistinctPromotionNames } from '../../services/promotionService.js';

export const name = 'get-promotions';
export const description = 'Show a member’s promotion history.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Show a member’s promotion history')
  .addStringOption(option =>
    option.setName('name')
      .setDescription('The member’s RSN')
      .setRequired(true)
      .setAutocomplete(true)
);

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const guildId = interaction.guild.id;

  try {
    // Get all distinct RSNs for this guild from promotions table
    const names = await findDistinctPromotionNames(guildId);

    // Filter based on the user’s current input
    const filtered = names.filter(name =>
      name.toLowerCase().includes(focusedValue)
    );

    // Respond with up to 25 choices (Discord limit)
    await interaction.respond(
      filtered.slice(0, 25).map(name => ({ name, value: name }))
    );
  } catch (err) {
    console.error(`Error fetching promotion autocomplete: ${err.message}`);
    await interaction.respond([]);
  }
}

export async function execute(interaction) {
  await interaction.deferReply();

  const memberName = interaction.options.getString('name').replace(/[_-]/g, ' ').toLowerCase();

  try {
    // Get all name changes for this member
    const nameChanges = await womClient.players.getPlayerNames(memberName);
    const allNames = nameChanges.map(change => change.oldName.toLowerCase());
    allNames.push(memberName); // Include current name for search

    // Get latest known name
    let latestName;
    if (nameChanges.length > 0) {
      latestName = nameChanges[0].newName;
    } else {
      const playerDetails = await womClient.players.getPlayerDetails(memberName);
      latestName = playerDetails.displayName || memberName;
    }

    // Fetch promotions from DB
    const promotions = await findPromotionsByNames(interaction.guild.id, allNames);

    if (!promotions.length) {
      return interaction.editReply(`📭 No promotions found for **${latestName}** in this guild.`);
    }

    // Get custom emojis
    await interaction.client.application.fetch();
    const appEmojis = await interaction.client.application.emojis.fetch();

    // Build description lines
    const description = promotions.map(row => {
      const unix = Math.floor(row.timestamp / 1000);
      const beforeRankEmoji = appEmojis.find(e => e.name === row.beforeRank.toLowerCase().replace(/ /g, '_')) || '';
      const afterRankEmoji = appEmojis.find(e => e.name === row.afterRank.toLowerCase().replace(/ /g, '_')) || '';

      const asName = row.rsn.toLowerCase() !== memberName ? ` (As: \`${row.rsn}\`)` : '';

      return `<t:${unix}:D>: \`${row.beforeRank}\` ${beforeRankEmoji} -> \`${row.afterRank}\` ${afterRankEmoji}${asName}`;
    }).join('\n');

    // Build and send embed
    const embed = new EmbedBuilder()
      .setTitle(`${latestName}'s Promotion History`)
      .setColor(MAIN_COLOR)
      .setDescription(description);

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logError(`Error fetching promotions: ${err.message}`);
    interaction.editReply(`❌ There was an error retrieving promotions for **${memberName}**.`);
  }
}
// This command retrieves and displays a player's promotion history in a Discord guild.
// It fetches the player's name changes, finds their promotion history in the database, and formats
// the results into an embed with timestamps and emojis representing their ranks before and after each promotion.