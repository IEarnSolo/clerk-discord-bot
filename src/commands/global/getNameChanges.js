import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { womClient } from '../../services/womClient.js';
import { info, error as logError } from '../../utils/logger.js';
import { MAIN_COLOR } from '../../config.js';

export const name = 'get-name-changes';
export const description = 'Display all RuneScape name changes for a player.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(description)
  .addStringOption(option =>
    option
      .setName('username')
      .setDescription('The OSRS username to look up')
      .setRequired(true)
  );

export async function execute(interaction) {
  const username = interaction.options.getString('username');

  try {
    const nameChanges = await womClient.players.getPlayerNames(username);

    if (!nameChanges || nameChanges.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription(`❌ No name changes found for **${username}**.`)
        ]
      });
    }

    // Sort oldest → newest
    nameChanges.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Latest name is newest newName
    const latestName = nameChanges[nameChanges.length - 1].newName;

    // Format the changes list
    const formattedChanges = nameChanges.map(change => {
      const unixTime = Math.floor(new Date(change.createdAt).getTime() / 1000);
      return `<t:${unixTime}:d>: \`${change.oldName}\` → \`${change.newName}\``;
    });

    // Create the embed
    const embed = new EmbedBuilder()
      .setColor(MAIN_COLOR)
      .setTitle(`🔍 Name changes for ${latestName}`)
      .setDescription(formattedChanges.join('\n'))
      .setFooter({ text: `${nameChanges.length} name change${nameChanges.length !== 1 ? 's' : ''} found` })
      .setTimestamp(new Date());

    // Send the embed
    await interaction.reply({ embeds: [embed] });

    info(`Fetched ${nameChanges.length} name changes for ${username}`);
  } catch (err) {
    logError(`Error fetching name changes for ${username}: ${err.message}`);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`❌ There was an error retrieving name changes for **${username}**.`)
      ],
      ephemeral: true
    });
  }
}
// This command fetches and displays all RuneScape name changes for a given player.
// It retrieves the name changes from the WOM API, formats them, and sends an embed with the details.
// If no name changes are found, it informs the user. If an error occurs, it logs the error and informs the user of the failure.