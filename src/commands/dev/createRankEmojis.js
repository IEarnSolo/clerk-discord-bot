// src/commands/dev/createRankEmojis.js
import { SlashCommandBuilder } from 'discord.js';
import { createApplicationRankEmojis } from '../../utils/emojiUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('create-rank-emojis')
    .setDescription('Upload all rank images as application emojis. (developer command)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await createApplicationRankEmojis(interaction.client);
      await interaction.editReply('✅ All rank emojis uploaded.');
    } catch (err) {
      await interaction.editReply(`❌ Error uploading emojis: ${err.message}`);
    }
  }
};
