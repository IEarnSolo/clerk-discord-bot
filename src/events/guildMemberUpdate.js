import { Events, AuditLogEvent } from 'discord.js';
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
    // Skip if no nickname/display name change
    if (oldMember.nickname === newMember.nickname && oldMember.displayName === newMember.displayName) {
      return;
    }

    let executorInfo = 'Unknown';
    try {
      // Fetch the audit log entry for member updates (nickname/display name changes)
      const logs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 5
      });

      const entry = logs.entries.find(
        e =>
          e.target.id === newMember.id &&
          ((oldMember.nickname !== newMember.nickname && e.changes.some(c => c.key === 'nick')) ||
           (oldMember.displayName !== newMember.displayName && e.changes.some(c => c.key === 'displayName')))
      );

      if (entry) {
        executorInfo = `${entry.executor.tag} (ID: ${entry.executor.id})`;
      }
    } catch (err) {
      logError(`Failed to fetch audit logs for ${newMember.user.tag}: ${err.message}`);
    }

    info(`Member update detected for: ${newMember.user.tag}`);
    info(`Old display name: ${oldMember.displayName} | New display name: ${newMember.displayName}`);
    info(`Updated by: ${executorInfo}`);

    await fetchRankAndAssignRole(newMember);
  }
};