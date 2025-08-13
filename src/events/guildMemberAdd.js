import { Events } from 'discord.js';
import { fetchRankAndAssignRole } from '../utils/roleUtils.js';
import { getWelcomeMessage } from '../services/welcomeMessageService.js';
import { info, warn, error as logError } from '../utils/logger.js';

/**
 * Event handler for guild member add events.
 * When a new member joins, auto-rank them and send a welcome message if set.
 * @param {GuildMember} member - The guild member who joined
 */
export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member) {
    info(`New member joined: ${member.user.username} in guild ${member.guild.name}`);

    // Auto-rank
    await fetchRankAndAssignRole(member);

    // Get the custom welcome message
    const welcomeMessage = await getWelcomeMessage(member.guild.id);
    if (!welcomeMessage) {
      warn(`No welcome message set for guild ${member.guild.name}`);
      return;
    }

    // Send the welcome message
    try {
      await member.send(welcomeMessage);
      info(`Sent welcome message to ${member.user.tag}`);
    } catch (err) {
      logError(`Could not send welcome message to ${member.user.tag}: ${err.message}`);
    }
  }
};
