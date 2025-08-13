// src/commands/unlinkComp.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { findCompetitionById, deleteCompetition } from '../../services/competitionService.js';
import { error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';

export const name = 'unlink-competition';
export const description = 'Unlink a competition by its Wise Old Man competition ID.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Unlink a competition from the database.')
  .addStringOption(option =>
    option.setName('competitionid')
      .setDescription('The Wise Old Man competition ID')
      .setRequired(true)
  );

export async function execute(interaction) {
  const competitionId = interaction.options.getString('competitionid');

  try {
    const existing = await findCompetitionById(competitionId);
    if (!existing) {
      return interaction.reply({
        content: `No competition found with ID **${competitionId}**.`,
        ephemeral: true
      });
    }

    await deleteCompetition(competitionId);

    const embed = new EmbedBuilder()
      .setTitle('Competition Unlinked')
      .setDescription(`Competition with ID \`${competitionId}\` has been successfully unlinked.`)
      .setColor(MAIN_COLOR);

    await interaction.reply({ embeds: [embed] });

  } catch (err) {
    logError(`Error unlinking competition ${competitionId}: ${err.message}`);
    return interaction.reply({
      content: `❌ There was an error unlinking the competition. Please try again.`,
      ephemeral: true
    });
  }
}