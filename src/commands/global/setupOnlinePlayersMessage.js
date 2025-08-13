import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { setOnlinePlayersMessageId, setOnlineMembersChannelId } from '../../services/onlinePlayersConfigService.js';
import { error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';

export const name = 'setup-online-players-message';
export const description = 'Set up the online players message in this channel.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Set up the online players message in this channel.');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true }); // keep ephemeral so the command use isn't visible

  try {
    const guildId = interaction.guild.id;

    // Create the placeholder embed
    const embed = new EmbedBuilder()
      .setTitle('Online Player Message Setup Complete')
      .setColor(MAIN_COLOR)
      .setDescription(
        `The online player message has been set up in this channel.\n\n` +
        `This message will soon update automatically to show the current online players.`
      );

    // Send the embed and get the message reference
    const sentEmbedMessage = await interaction.channel.send({ embeds: [embed] });

    // Save this embed's message ID & channel ID in DB
    await setOnlinePlayersMessageId(guildId, sentEmbedMessage.id);
    await setOnlineMembersChannelId(guildId, sentEmbedMessage.channel.id);

    // Just confirm privately to the user that ran the command
    await interaction.editReply({ content: 'Online players message has been set up successfully.' });

  } catch (err) {
    logError(`Error setting up online players message: ${err.message}`);
    await interaction.editReply({
      content: '❌ Failed to set up the online players message. Please try again later.'
    });
  }
}
// This command sets up an online players message in the current channel.
// It creates a placeholder embed, sends it, and saves the message ID and channel ID in the database.