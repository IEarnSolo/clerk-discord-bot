import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { WOM_BOT_ID } from '../../config.js';
import { run } from '../../services/databaseService.js';

// Regex for parsing embed lines
const lineRegex = /(.+): `(.+)` <.+> -> `(.+)` <.+>/;

// Utility: normalize name
function normalizeName(name) {
  return name?.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
}

/**
 * Default export: command registration + execution
 */
export default {
  data: new ContextMenuCommandBuilder()
    .setName('Add Note')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    return handleAddNote(interaction);
  },
};

/**
 * Handler for right-click "Add Note"
 */
async function handleAddNote(interaction) {
  if (!interaction.isMessageContextMenuCommand()) return;

  const targetMessage = interaction.targetMessage;

  // Ensure WOM bot
  if (targetMessage.author.id !== WOM_BOT_ID) {
    return interaction.reply({
      content: '❌ This only works on WOM bot messages.',
      ephemeral: true,
    });
  }

  // Extract lines from embed
  const embed = targetMessage.embeds[0];
  if (!embed || !embed.description) {
    return interaction.reply({
      content: '❌ No embed with changes found.',
      ephemeral: true,
    });
  }

  const lines = embed.description.split('\n');
  const changes = lines
    .map(line => line.match(lineRegex))
    .filter(Boolean)
    .map(([, memberName]) => memberName);

  if (changes.length === 0) {
    return interaction.reply({
      content: '❌ No member names found in this embed.',
      ephemeral: true,
    });
  }

  const memberNames = changes.join(', ');

  // Build modal
  const modal = new ModalBuilder()
    .setCustomId(`add_note_modal-${targetMessage.id}-${targetMessage.channel.id}`)
    .setTitle('Add Note');

  const memberField = new TextInputBuilder()
    .setCustomId('memberNames')
    .setLabel('Member Name(s)')
    .setStyle(TextInputStyle.Short)
    .setValue(memberNames)
    .setRequired(true);

  const noteField = new TextInputBuilder()
    .setCustomId('note')
    .setLabel('Note')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter your note here...')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(memberField),
    new ActionRowBuilder().addComponents(noteField)
  );

  await interaction.showModal(modal);
}

/**
 * Separate handler for modal submission
 */
export async function handleAddNoteModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith('add_note_modal-')) return;

  // CustomId now includes messageId and channelId: add_note_modal-<messageId>-<channelId>
  const [, messageId, channelId] = interaction.customId.split('-');
  const guildId = interaction.guild.id;

  const rawMemberNames = interaction.fields.getTextInputValue('memberNames');
  const note = interaction.fields.getTextInputValue('note');

  const memberNames = rawMemberNames.split(',').map(n => n.trim()).filter(Boolean);

  await interaction.deferReply({ ephemeral: true });

  // Ensure we have guild members cached
  await interaction.guild.members.fetch();

  for (const memberName of memberNames) {
    let userId = null;
    let username = null;

    // Attempt to match Discord member
    const discordMember = interaction.guild.members.cache.find(m => {
      const namesToMatch = [
        m.user.username,
        m.displayName,
        m.nickname,
      ]
        .filter(Boolean)
        .map(normalizeName);

      return namesToMatch.includes(normalizeName(memberName));
    });

    if (discordMember) {
      userId = discordMember.user.id;
      username = discordMember.user.username;
    }

    await run(
      `
      INSERT INTO message_notes (guild_id, user_id, rsn, message_id, channel_id, username, note, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [guildId, userId, memberName, messageId, channelId, username, note, Date.now()]
    );
  }

  await interaction.editReply({ content: '✅ Notes saved successfully!' });
}