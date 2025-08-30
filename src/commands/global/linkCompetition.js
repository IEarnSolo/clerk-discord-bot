// src/commands/linkComp.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { womClient } from '../../services/womClient.js';
import { WOM_COMPETITION_BASE_URL } from '../../config.js';
import { parseEmoji } from '../../utils/emojiUtils.js';
import { info, error as logError } from '../../utils/logger.js';
import { findCompetitionById, insertCompetition, updateCompetitionLink
} from '../../services/competitionService.js';
import { MAIN_COLOR } from '../../config.js';

const competitionLinkBase = WOM_COMPETITION_BASE_URL;

export const name = 'link-competition';
export const description = 'Link a WOM competition to a Discord message and add existing reactions as participants.';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Link a WOM competition to a Discord message.')
  .addStringOption(option => option.setName('competitionid').setDescription('The WOM competition ID').setRequired(true))
  .addStringOption(option => option.setName('messagelink').setDescription('The link to the Discord message').setRequired(true))
  .addStringOption(option => option.setName('emoji').setDescription('The emoji users react with to join').setRequired(true))
  .addStringOption(option => option.setName('verificationcode').setDescription('Verification code (not required if linking after using /createcomp)').setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply();

  const competitionId = interaction.options.getString('competitionid');
  const messageLink = interaction.options.getString('messagelink');
  const emoji = interaction.options.getString('emoji');
  const verificationCode = interaction.options.getString('verificationcode');

  try {
    const competition = await womClient.competitions.getCompetitionDetails(competitionId);
    if (!competition) {
      return interaction.editReply(`❌ Could not find competition with ID \`${competitionId}\`.`);
    }

    const startsAtTimestamp = new Date(competition.startsAt).getTime();
    const endsAtTimestamp = new Date(competition.endsAt).getTime();

    const linkParts = messageLink.split('/');
    const channelId = linkParts[linkParts.length - 2];
    const messageId = linkParts[linkParts.length - 1];

    const existingRow = await findCompetitionById(competitionId);

    if (!existingRow && !verificationCode) {
      return interaction.editReply(
        `❌ This competition is not saved yet and requires a verification code.\nUsage: \`/linkcomp competitionid:<id> messagelink:<link> emoji:<emoji> verificationcode:<code>\``
      );
    }

    const actualVerificationCode = verificationCode || existingRow.verificationCode;

    if (existingRow) {
      await updateCompetitionLink(competitionId, messageLink, emoji);
    } else {
      await insertCompetition({
        competitionId,
        messageLink,
        verificationCode: actualVerificationCode,
        emoji,
        title: competition.title,
        metric: competition.metric,
        startsAt: startsAtTimestamp,
        endsAt: endsAtTimestamp
      });
    }

    const channel = await interaction.guild.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      return interaction.editReply(`❌ Invalid message link or channel.`);
    }

    const targetMessage = await channel.messages.fetch(messageId);
    await targetMessage.react(emoji);

    const parsedEmoji = parseEmoji(emoji);
    const reaction = targetMessage.reactions.cache.find(
      r => r.emoji.id === parsedEmoji.id || r.emoji.name === parsedEmoji.name
    );

    let addedCount = 0;
    if (reaction) {
      const users = await reaction.users.fetch();
      for (const user of users.values()) {
        if (user.bot) continue;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const rawName = member?.nickname || member?.displayName || user.username;
        const formattedName = rawName.replace(/[_-]/g, ' ').toLowerCase();

        try {
          await womClient.competitions.addParticipants(competitionId, [formattedName], actualVerificationCode);
          addedCount++;
          await user.send(`You've been added to the competition ${competition.emoji} [${competition.title}](${WOM_COMPETITION_BASE_URL}${competitionId}) ${competition.emoji}`);
        } catch (err) {
          logError(`Error adding participant: ${err.message}`);
          //await user.send(`⚠️ Could not add you to "${competition.title}".`);
        }
      }
    }

    let description = `Linked to [this message](${messageLink}) with emoji ${emoji}`;
    if (addedCount > 0) {
    description += `\nAdded **${addedCount}** participants from existing reactions.`;
    }

    const embed = new EmbedBuilder()
    .setTitle(`Competition Linked: ${competition.title}`)
    .setURL(`${competitionLinkBase}${competitionId}`)
    .setColor(MAIN_COLOR)
    .setDescription(description);

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logError(`Error linking competition: ${err.message}`);
    interaction.editReply(`❌ Failed to link competition: ${err.message}`);
  }
}
// This command links a WOM competition to a Discord message, allowing users to join by reacting with a specified emoji.
// It fetches the competition details, validates the message link, and adds existing reactions as participants.
// If the competition is not already saved, it requires a verification code to link it.