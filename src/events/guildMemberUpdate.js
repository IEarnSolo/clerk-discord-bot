import { Events } from 'discord.js';
import { info, warn, error as logError } from '../utils/logger.js';
import { fetchRankAndAssignRole } from '../utils/roleUtils.js';

/**
 * Event handler for guild member update events.
 * When a member's nickname or display name changes, fetch their WOM rank and assign roles accordingly.
 * @param {GuildMember} oldMember - The previous state of the guild member
 * @param {GuildMember} newMember - The updated state of the guild member
 */
export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    // Skip if no nickname or display name change
    if (oldMember.nickname === newMember.nickname && oldMember.displayName === newMember.displayName) {
      return;
    }

    info(`Member update detected for: ${newMember.user.username}`);
    info(`Old display name: ${oldMember.displayName} | New display name: ${newMember.displayName}`);

    await fetchRankAndAssignRole(newMember);
  }
};