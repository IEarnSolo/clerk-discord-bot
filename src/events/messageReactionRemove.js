import { Events } from 'discord.js';
import { getCompetitionByMessageLink } from '../services/competitionService.js';
import { updateCompetitionTimesIfChanged } from '../utils/competitionUtils.js';
import { womClient } from '../services/womClient.js';
import { warn, info, error as logError } from '../utils/logger.js';
import { WOM_COMPETITION_BASE_URL } from '../config.js';

/**
 * Event handler for message reaction remove events.
 * Processes reactions removed from competition messages to remove participants.
 * @param {MessageReaction} reaction - The Discord message reaction object
 * @param {User} user - The Discord user who removed the reaction
 */
export default {
  name: Events.MessageReactionRemove,
  once: false,

  async execute(reaction, user) {
    if (user.bot) return;

    // Ensure we have the full reaction and message
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

    info(`Reaction removed by ${user.tag} on ${messageLink} for competition ${competition.competitionId}`);

    //await updateCompetitionTimesIfChanged(competition.competitionId, competition);

    const now = Date.now();
    const competitionEnd = Number(competition.endsAt);
    if (competitionEnd < now) {
      warn(`Competition ${competition.competitionId} has ended.`);
      return;
    }

    // Try to get guild member from cache or fetch
    let guildMember = guild.members.cache.get(user.id);
    if (!guildMember) {
      try {
        guildMember = await guild.members.fetch(user.id);
      } catch {
        warn(`Guild member not found for user ${user.id}`);
        return;
      }
    }

    const playerName = guildMember.nickname || guildMember.displayName || user.username;
    const formattedName = playerName.replace(/[_-]/g, ' ').toLowerCase();
    info(`Removing ${formattedName} from competition ${competition.title}`);

    try {
      await womClient.competitions.removeParticipants(
        competition.competitionId,
        [formattedName],
        competition.verificationCode
      );
      info(`Successfully removed ${formattedName} from ${competition.title}`);
      await user.send(
        `You've been removed from the competition ${competition.emoji} [${competition.title}](${WOM_COMPETITION_BASE_URL}${competition.competitionId}) ${competition.emoji}`
      );
    } catch (err) {
      logError(`Error removing participant: ${err.message}`);
    }
  }
};
