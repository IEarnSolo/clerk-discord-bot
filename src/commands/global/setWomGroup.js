import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { upsertWomGroupGuildLink } from '../../services/clanGuildLinksService.js';
import { error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';

export const name = 'set-wom-group';
export const description = 'Set or update the Wise Old Man group ID for this server.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Set or update the WOM group ID for this server')
  .addStringOption(option =>
    option
      .setName('groupid')
      .setDescription('Wise Old Man group ID')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const womGroupId = interaction.options.getString('groupid');
  const guildId = interaction.guild.id;

  try {
    const action = await upsertWomGroupGuildLink(guildId, womGroupId);

    const embed = new EmbedBuilder()
    .setTitle('Wise Old Man Group ID Set')
    .setColor(MAIN_COLOR)
    .setDescription(
        `Successfully **${action === 'updated' ? 'updated' : 'set'}** the WOM group ID for this server to \`${womGroupId}\`.`
    );

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logError(`Error setting WOM group ID: ${err.message}`);
    await interaction.editReply({
      content: '❌ There was an error setting the WOM group ID. Please try again.'
    });
  }
}