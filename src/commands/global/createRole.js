import path from 'path';
import fs from 'fs';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createRankRole } from '../../utils/roleUtils.js';
import { error as logError } from '../../utils/logger.js';
import { MAIN_COLOR, RANK_IMAGES_FOLDER } from '../../config.js';

export const name = 'create-role';
export const description = 'Create a rank role (with optional emoji) from an image.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Create a rank role (with optional emoji) from an image.')
  .addStringOption(option =>
    option.setName('rank')
      .setDescription('The rank name (must match a rank image)')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option.setName('emoji')
      .setDescription('Whether to create an emoji for this rank (yes/no)')
      .setRequired(true)
      .addChoices(
        { name: 'Yes', value: 'yes' },
        { name: 'No', value: 'no' }
      )
  );

export async function autocomplete(interaction) {
  if (interaction.commandName !== 'createrole') return;

  const focused = interaction.options.getFocused();

  let allRanks = [];
  try {
    allRanks = fs.readdirSync(RANK_IMAGES_FOLDER)
      .filter(file => file.endsWith('.png'))
      .map(file => path.parse(file).name);
  } catch (err) {
    logError('Failed to read rank images:', err);
    return;
  }

  const filtered = allRanks
    .filter(name => name.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25);

  try {
    await interaction.respond(
      filtered.map(name => ({ name, value: name }))
    );
  } catch (err) {
    logError('Autocomplete error:', err);
  }
}

export async function execute(interaction) {
  const rankName = interaction.options.getString('rank');
  const createEmoji = interaction.options.getString('emoji') === 'yes';

  await interaction.deferReply();

  try {
    const { role, emoji } = await createRankRole(interaction.guild, rankName, createEmoji);

    const embed = new EmbedBuilder()
      .setTitle('Role Created')
      .setDescription(`✅ Created role **${role.name}**.${emoji ? `\nEmoji created: ${emoji.toString()}` : ''}`)
      .setColor(MAIN_COLOR);

    if (!interaction.guild.features.includes('ROLE_ICONS')) {
      embed.setFooter({ text: 'Tip: Boost to level 2 to allow role icons.' });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    const errorEmbed = new EmbedBuilder()
      .setTitle('Error')
      .setDescription(`❌ Failed to create role: ${err.message}`)
      .setColor(MAIN_COLOR);

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}
// This command creates a rank role in the guild based on a provided rank name.
// It optionally creates an emoji for the rank if specified.
// The command supports autocomplete for rank names based on available images in the rankimages folder.