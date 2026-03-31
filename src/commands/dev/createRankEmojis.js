// src/commands/dev/createRankEmojis.js
import { SlashCommandBuilder } from 'discord.js';
import { uploadApplicationEmojis } from '../../utils/emojiUtils.js';

export default {
  data: new SlashCommandBuilder()
    .setName('upload-application-emojis')
    .setDescription('Upload all images from asset folders as application emojis. (developer command)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await uploadApplicationEmojis(interaction.client);
      await interaction.editReply('✅ All application emojis uploaded.');
    } catch (err) {
      await interaction.editReply(`❌ Error uploading emojis: ${err.message}`);
    }
  }
};
