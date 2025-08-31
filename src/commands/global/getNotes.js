// commands/get-notes.js
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { MAIN_COLOR } from '../../config.js';
import { all } from '../../services/databaseService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('get-notes')
    .setDescription('Fetch all notes for a given RSN')
    .addStringOption(option =>
      option
        .setName('rsn')
        .setDescription('The RSN to fetch notes for')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    // Fetch all unique RSNs for this guild
    const rsns = await all(
      `SELECT DISTINCT rsn FROM message_notes WHERE guild_id = ?`,
      [interaction.guild.id]
    );

    const filtered = rsns
      .map(r => r.rsn)
      .filter(rsn => rsn.toLowerCase().includes(focusedValue))
      .slice(0, 25); // Discord limit

    await interaction.respond(
      filtered.map(rsn => ({ name: rsn, value: rsn }))
    );
  },

  async execute(interaction) {
    const rsn = interaction.options.getString('rsn');
    const guildId = interaction.guild.id;

    // Fetch notes for this RSN
    const notes = await all(
      `SELECT * FROM message_notes WHERE guild_id = ? AND rsn = ? ORDER BY timestamp ASC`,
      [guildId, rsn]
    );

    if (!notes || notes.length === 0) {
      return interaction.reply({ content: `❌ No notes found for **${rsn}**.`, ephemeral: true });
    }

    // Try to resolve the "display name" for the embed title if user_id exists
    let titleName = rsn;
    const firstNoteWithUserId = notes.find(n => n.user_id);
    if (firstNoteWithUserId) {
      try {
        const member = await interaction.guild.members.fetch(firstNoteWithUserId.user_id).catch(() => null);
        if (member) {
          titleName = member.nickname || member.displayName || rsn;
        }
      } catch (e) {
        // fallback to rsn if fetch fails
        titleName = rsn;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`Notes for ${titleName}`)
      .setColor(MAIN_COLOR);

    // Build description with timestamp, note, added by, and jump link
    embed.setDescription(
      notes.map(note => {
        const timestampSeconds = Math.floor(note.timestamp / 1000);
        const tsString = `<t:${timestampSeconds}:D>`;
        const jumpLink = note.channel_id && note.message_id
          ? `[Jump to message](https://discord.com/channels/${guildId}/${note.channel_id}/${note.message_id})`
          : '';

        const addedBy = note.added_user_id
          ? `(Added by <@${note.added_user_id}>)`
          : '';

        return `${tsString}: \`${note.note}\` ${addedBy} ${jumpLink}`.trim();
      }).join('\n')
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};