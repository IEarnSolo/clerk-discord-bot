// src/events/messageUpdate.js
import { get, run } from '../services/databaseService.js';
import { info, error as logError, fullError } from '../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import { WOM_BOT_ID, MAIN_COLOR } from '../config.js';
import { findCompetitionByPollId } from '../services/competitionService.js';
import { catchUpPolls } from '../utils/pollUtils.js';

export default {
  name: 'messageUpdate',
  once: false,

  async execute(oldMessage, newMessage, client) {
    try {
      //
      // ---- 1. WOM Group Link Handling ----
      //
      if (newMessage.author?.id === WOM_BOT_ID && newMessage.embeds.length > 0) {
        const embed = newMessage.embeds[0];
        const url = embed.url;

        if (url && url.includes('/groups/') && !url.includes('activity')) {
          const match = url.match(/\/groups\/(\d+)$/);
          if (match) {
            const womGroupId = match[1];
            const guildId = newMessage.guild?.id;
            if (!guildId) {
              logError('Guild ID missing in messageUpdate event.');
              return;
            }

            info(`Extracted WOM Group ID: ${womGroupId} for Guild ID: ${guildId}`);

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

            const confirmEmbed = new EmbedBuilder()
              .setColor(MAIN_COLOR)
              .setDescription('Successfully linked the Wise Old Man group to the Clerk bot!');

            await newMessage.channel.send({ embeds: [confirmEmbed] });
          }
        }
      }

//
// ---- 2. Competition Poll Expiration Handling ----
//
if (!oldMessage.poll || !newMessage.poll) return;

info(`[PollCheck] Message updated: ${newMessage.id}`);
info(`[PollCheck] resultsFinalized: ${newMessage.poll.resultsFinalized}`);

if (newMessage.poll.resultsFinalized) {
  const comp = await findCompetitionByPollId(newMessage.id);
  if (!comp) {
    info(`[PollCheck] No competition row matched poll message ${newMessage.id}`);
    return;
  }

  await catchUpPolls(client, comp); // 🔹 Reuse the same logic
}
    } catch (err) {
      fullError('Error in messageUpdate event:', err);
    }
  }
};