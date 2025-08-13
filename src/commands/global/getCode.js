import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import crypto from 'crypto';
import {
  getVerificationCode,
  upsertVerificationCode
} from '../../services/clanGuildLinksService.js';
import { error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';

export const name = 'get-code';
export const description = 'Get or generate your verification code.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Get or generate your verification code for linking OSRS clan.');

export async function execute(interaction) {
  const guildId = interaction.guild.id;
  await interaction.deferReply({ ephemeral: true });

  try {
    const existingCode = await getVerificationCode(guildId);

    if (existingCode) {
      const embed = new EmbedBuilder()
        .setTitle('Verification Code')
        .setDescription(`🔑 Your verification code is:\n\`${existingCode}\``)
        .setColor(MAIN_COLOR);

      return interaction.editReply({ embeds: [embed] });
    }

    const newCode = crypto.randomBytes(16).toString('hex');
    await upsertVerificationCode(guildId, newCode);

    const embed = new EmbedBuilder()
      .setTitle('Verification Code Created')
      .setDescription(`New verification code generated:\n\`${newCode}\``)
      .setColor(MAIN_COLOR);

    return interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logError('Error handling /getcode command:', err);
    const errorEmbed = new EmbedBuilder()
      .setTitle('Unexpected Error')
      .setDescription('❌ An unexpected error occurred. Please try again later.')
      .setColor(0xFF0000);

    return interaction.editReply({ embeds: [errorEmbed] });
  }
}
// This command retrieves or generates a verification code for linking a Discord guild to an OSRS clan.
// It checks if a code already exists for the guild; if so, it returns that code.
// If no code exists, it generates a new one, saves it, and returns the new code.
// All responses are sent as ephemeral messages to ensure privacy.