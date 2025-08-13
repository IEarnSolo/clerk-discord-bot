// src/events/messageReactionAdd.js
import { Events } from 'discord.js';
import { getCompetitionByMessageLink } from '../services/competitionService.js';
import { updateCompetitionTimesIfChanged } from '../utils/competitionUtils.js';
import { womClient } from '../services/womClient.js';
import { warn, info, error as logError } from '../utils/logger.js';

/** Event handler for message reaction add events.
 * Processes reactions added to competition messages to add participants.
 * @param {MessageReaction} reaction - The Discord message reaction object
 * @param {User} user - The Discord user who added the reaction
 */
export default {
  name: Events.MessageReactionAdd,
  once: false,

  async execute(reaction, user) {
    if (user.bot) return;

    // Ensure full reaction & message objects
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
    } catch (err) {
      logError(`Failed to fetch partial reaction/message: ${err.message}`);
      return;
    }

    const guild = reaction.message.guild;
    if (!guild) return;

    const messageLink = `https://discord.com/channels/${guild.id}/${reaction.message.channel.id}/${reaction.message.id}`;
    const competition = await getCompetitionByMessageLink(messageLink);

    if (!competition || reaction.emoji.toString() !== competition.emoji) {
      return;
    }

    info(`Reaction added by ${user.tag} on ${messageLink} for competition ${competition.competitionId}`);

    await updateCompetitionTimesIfChanged(competition.competitionId, competition);

    // Stop if competition ended
    const now = Date.now();
    const competitionEnd = Number(competition.endsAt);
    if (competitionEnd < now) {
      warn(`Competition ${competition.competitionId} has ended.`);
      return;
    }

    const guildMember = guild.members.cache.get(user.id);
    if (!guildMember) {
      warn(`Guild member not found for user ${user.id}`);
      return;
    }

    const playerName = guildMember.nickname || guildMember.displayName || user.username;
    const formattedName = playerName.replace(/[_-]/g, ' ').toLowerCase();
    info(`Adding ${formattedName} to competition ${competition.competitionId}`);

    try {
      await womClient.competitions.addParticipants(
        competition.competitionId,
        [formattedName],
        competition.verificationCode
      );
      info(`Successfully added ${formattedName} to ${competition.title}`);
      await user.send(
        `You've been added to the competition "${competition.title}".\nView it here: https://wiseoldman.net/competitions/${competition.competitionId}`
      );
    } catch (err) {
      logError(`Error adding participant: ${err.message}`);
      await user.send(
        `There was an error adding you to "${competition.title}". Please try again later.`
      );
    }
  }
};