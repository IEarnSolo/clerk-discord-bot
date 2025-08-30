// commands/end-poll.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { get, run } from '../../services/databaseService.js';
//import { CompetitionStatus } from '../../constants.js';
import { info, error as logError } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('end-poll')
    .setDescription('Manually end a competition poll')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin only
    .addStringOption(option =>
      option.setName('poll_id')
        .setDescription('The ID of the poll message')
        .setRequired(true)
    ),

  async execute(interaction) {
    const pollId = interaction.options.getString('poll_id');
    const guildId = interaction.guild.id;

    try {
      // Get the competition linked to this poll
      const comp = await get(
        `SELECT * FROM competitions WHERE (poll_message_id = ? OR tiebreaker_poll_message_id = ?) AND guild_id = ?`,
        [pollId, pollId, guildId]
      );

      if (!comp) {
        return interaction.reply({ content: '❌ Poll not found in database.', ephemeral: true });
      }

      // Fetch event_planning_channel_id from channel_settings
      const channelSettings = await get(
        `SELECT event_planning_channel_id 
         FROM channel_settings 
         WHERE guild_id = ?`,
        [guildId]
      );

      if (!channelSettings?.event_planning_channel_id) {
        return interaction.reply({ content: '❌ Event planning channel not set in this server.', ephemeral: true });
      }

      const planningChannel = await interaction.client.channels.fetch(channelSettings.event_planning_channel_id);
      if (!planningChannel?.isTextBased()) {
        return interaction.reply({ content: '❌ Could not fetch the planning channel.', ephemeral: true });
      }

      // Fetch the poll message directly
      const pollMessage = await planningChannel.messages.fetch(pollId).catch(() => null);
      if (!pollMessage) {
        return interaction.reply({ content: '❌ Poll message not found in planning channel.', ephemeral: true });
      }

      // End the poll
      await pollMessage.poll.end();

      // Update competition status
      /* await run(
        `UPDATE competitions
         SET status = ?
         WHERE (poll_message_id = ? OR tiebreaker_poll_message_id = ?) AND guild_id = ?`,
        [CompetitionStatus.POLL_FINISHED, pollId, pollId, guildId]
      ); */

      await interaction.reply({
        content: `✅ Poll **${pollId}** has been ended and marked as finished.`,
        ephemeral: true
      });

    } catch (err) {
      console.error('[EndPollCommand]', err);
      await interaction.reply({
        content: '❌ Something went wrong ending the poll.',
        ephemeral: true
      });
    }
  }
};
