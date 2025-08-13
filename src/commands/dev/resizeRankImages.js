// src/commands/dev/resizeRankImages.js
import { SlashCommandBuilder } from 'discord.js';
import { resizeRankImages } from '../../utils/imageUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resize-rank-images')
    .setDescription('Resize all rank images to 128x128 maintaining aspect ratio. (developer command)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await resizeRankImages();
      await interaction.editReply('✅ All rank images resized to 128x128.');
    } catch (err) {
      await interaction.editReply(`❌ Error resizing images: ${err.message}`);
    }
  }
};