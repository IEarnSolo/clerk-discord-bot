// src/events/messageUpdate.js
import { get, run } from '../services/databaseService.js';
import { info, error as logError } from '../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import { WOM_BOT_ID, MAIN_COLOR } from '../config.js';

/**
 * Event handler for message updates to capture WOM group links.
 * @param {Message} oldMessage - The original Discord message object
 * @param {Message} newMessage - The updated Discord message object
 * @param {Client} client - The Discord client instance
 */
export default {
  name: 'messageUpdate',
  once: false,

  async execute(oldMessage, newMessage, client) {

    if (newMessage.author?.id !== WOM_BOT_ID) return;
    if (newMessage.embeds.length === 0) return;

    const embed = newMessage.embeds[0];
    const url = embed.url;

    if (!url || !url.includes('/groups/') || url.includes('activity')) return;

    const match = url.match(/\/groups\/(\d+)$/);
    if (!match) {
      info('No WOM group ID found in the URL.');
      return;
    }

    const womGroupId = match[1];
    const guildId = newMessage.guild?.id;
    if (!guildId) {
      logError('Guild ID missing in messageUpdate event.');
      return;
    }

    info(`Extracted WOM Group ID: ${womGroupId} for Guild ID: ${guildId}`);

    try {
      const row = await get(
        'SELECT wom_group_id FROM clan_guild_links WHERE guild_id = ?',
        [guildId]
      );

      if (row) {
        if (row.wom_group_id === womGroupId) {
          info('WOM Group ID is already linked. No update needed.');
          return;
        }

        await run(
          'UPDATE clan_guild_links SET wom_group_id = ? WHERE guild_id = ?',
          [womGroupId, guildId]
        );

        info(`Updated WOM Group ID to "${womGroupId}" for Guild ID: ${guildId}`);
      } else {
        await run(
          'INSERT INTO clan_guild_links (guild_id, wom_group_id) VALUES (?, ?)',
          [guildId, womGroupId]
        );

        info(`Stored new WOM Group ID "${womGroupId}" for Guild ID: ${guildId}`);
      }

      const embed = new EmbedBuilder()
        .setColor(MAIN_COLOR)
        .setDescription('Successfully linked the Wise Old Man group to the Clerk bot!');

        await newMessage.channel.send({ embeds: [embed] });
    } catch (err) {
      logError('Error processing WOM group link in messageUpdate event:', err);
    }
  }
};
// This event listens for message updates to capture WOM group links posted by the WOM bot.
// It extracts the group ID from the message embed and stores or updates it in the database.
// If the group ID is successfully linked or updated, it sends a confirmation message in the channel.