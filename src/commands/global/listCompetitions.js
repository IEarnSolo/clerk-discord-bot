import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { findAllCompetitions } from '../../services/competitionService.js';
import { WOM_COMPETITION_BASE_URL } from '../../config.js';
import { error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';

export const name = 'list-competitions';
export const description = 'List all linked WOM competitions.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('List all linked WOM competitions');

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const competitions = await findAllCompetitions(interaction.guildId);

    if (!competitions.length) {
      return interaction.editReply('📭 There are currently no competitions linked.');
    }

    // Build one embed with all comps
    const embed = new EmbedBuilder()
      .setTitle('📜 Linked Competitions')
      .setColor(MAIN_COLOR);

    competitions.forEach(comp => {
      const startDate = `<t:${Math.floor(comp.startsAt / 1000)}:F>`;
      const endDate = `<t:${Math.floor(comp.endsAt / 1000)}:F>`;
      const compLink = `${WOM_COMPETITION_BASE_URL}${comp.competitionId}`;
      const linkedMsg = comp.messageLink ? `[Jump to message](${comp.messageLink})` : '*No linked message*';

      embed.addFields({
        name: '\u200B',
        value:
            `${comp.emoji} **[${comp.title}](${compLink})** ${comp.emoji}\n` +
            `**ID:** \`${comp.competitionId}\`\n` +
            `**Start:** ${startDate}\n` +
            `**End:** ${endDate}\n` +
            `**Message:** ${linkedMsg}`
        });
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logError(`Error fetching competitions: ${err.message}`);
    interaction.editReply('❌ There was an error fetching the competitions.');
  }
}
// This command lists all WOM competitions linked to the bot, displaying their details in an embed.
// It fetches competitions from the database, formats them, and replies with an embed containing all the information.
// If no competitions are found, it informs the user. If an error occurs, it logs the error and informs the user of the failure.