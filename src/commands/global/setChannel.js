import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { run } from '../../services/databaseService.js';
import { error } from '../../utils/logger.js';

export const name = 'set-channel';

// All DB columns for channels except guild_id
const channelColumns = [
  'announcements_channel_id',
  'event_planning_channel_id',
  'promotion_logs_channel_id',
  'join_leave_logs_channel_id',
  'name_changes_channel_id',
  'clan_coffer_channel_id',
  'online_members_channel_id'
];

// Convert column names -> user-friendly option names
const channelTypes = channelColumns.map(col => ({
  column: col,
  name: col.replace(/_channel_id$/, '').replace(/_/g, '-')
}));

export default {
  data: new SlashCommandBuilder()
    .setName(name)
    .setDescription('Set a channel for a specific type of event/log.')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('The type of channel to set')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('channel_id')
        .setDescription('Optional channel ID (defaults to the channel you run the command in if not provided)')
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const filtered = channelTypes.filter(type =>
      type.name.toLowerCase().includes(focusedValue.toLowerCase())
    );
    await interaction.respond(
      filtered.map(type => ({ name: type.name, value: type.name }))
    );
  },

  async execute(interaction) {
    const typeName = interaction.options.getString('type');
    const providedChannelId = interaction.options.getString('channel_id');
    const targetChannelId = providedChannelId || interaction.channel.id;
    const guildId = interaction.guild.id;

    // Find matching column for given typeName
    const match = channelTypes.find(t => t.name === typeName);
    if (!match) {
      return interaction.reply({
        content: '❌ Invalid channel type provided.',
        ephemeral: true
      });
    }

    try {
      await run(
        `
        INSERT INTO channel_settings (guild_id, ${match.column})
        VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE
        SET ${match.column} = excluded.${match.column}
        `,
        [guildId, targetChannelId]
      );

      await interaction.reply({
        content: `✅ Set **${typeName}** to <#${targetChannelId}>`,
        ephemeral: true
      });
    } catch (err) {
      error(`Failed to set channel: ${err.message}`);
      await interaction.reply({
        content: '❌ Failed to set the channel. Please try again.',
        ephemeral: true
      });
    }
  }
};
