import { Events } from 'discord.js';
import { getGuildLink, upsertWomGroupGuildLink } from '../services/clanGuildLinksService.js';
import { info, error as logError, warn } from '../utils/logger.js';

/**
 * Event handler for guild create events.
 * When the bot joins a new guild, initialize it in the database.
 * @param {Guild} guild - The Discord guild object
 */
export default {
  name: Events.GuildCreate,
  async execute(guild) {
    info(`🤝 Joined new guild: ${guild.name} (${guild.id})`);

    try {
      // Fetch all members
      await guild.members.fetch();
      info(`👥 Fetched ${guild.memberCount} members from ${guild.name}`);

      // Fetch all roles
      const roles = guild.roles.cache.map(role => role.name).join(', ');
        info(`🛡️ Fetched ${guild.roles.cache.size} roles from ${guild.name}`);
        
      // Check if guild is already in DB
      const existing = await getGuildLink(guild.id);

      if (!existing) {
        // Insert with no WOM group ID for now
        await upsertWomGroupGuildLink(guild.id, null);
        info(`📌 Added guild ${guild.name} (${guild.id}) to database.`);
      } else {
        warn(`⚠ Guild ${guild.name} (${guild.id}) already exists in DB, skipping insert.`);
      }

    } catch (error) {
      logError(`❌ Error initializing guild ${guild.name}:`, error);
    }
  }
};