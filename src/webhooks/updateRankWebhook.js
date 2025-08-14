// src/webhooks/updateRankWebhook.js
import { get } from '../services/databaseService.js';
import { getGuildChannel } from '../services/channelSettingsService.js';
import { getEmojiForRank } from '../utils/emojiUtils.js';
import { updateMemberRole } from '../utils/roleUtils.js';
import { insertPromotionData } from '../services/promotionService.js';
import { info, warn, error as logError } from '../utils/logger.js';

/**
 * Handles rank updates for clan members.
 * Logs the change, updates the member's role, and records promotion history.
 */
export async function handle(req, res, client) {
  const { memberName, oldRank, newRank, clanName } = req.body;

  if (!memberName || !oldRank || !newRank || !clanName) {
    return res.status(400).send({
      error: 'Missing memberName, oldRank, newRank, or clanName in the payload.'
    });
  }

  try {
    const row = await get(
      'SELECT guild_id FROM clan_guild_links WHERE clan_name = ?',
      [clanName]
    );

    if (!row) {
      return res.status(404).send({
        error: `No guild linked to clan "${clanName}".`
      });
    }

    const guildId = row.guild_id;
    const guild = await client.guilds.fetch(guildId);
    const promotionLogChannelId = await getGuildChannel(
      guildId,
      'promotion_logs_channel_id'
    );

    // 1. Send promotion embed
    if (promotionLogChannelId) {
      const channel = guild.channels.cache.get(promotionLogChannelId);
      if (channel) {
        const oldEmoji = await getEmojiForRank(oldRank, guild);
        const newEmoji = await getEmojiForRank(newRank, guild);

        const embed = {
          color: 0x1d82b6,
          title: '🗒️ Rank Change',
          description: `**${memberName}** has changed ranks`,
          fields: [
            { name: 'Old Rank', value: `${oldEmoji} ${oldRank}`, inline: true },
            { name: 'New Rank', value: `${newEmoji} ${newRank}`, inline: true }
          ],
          timestamp: new Date().toISOString()
        };

        await channel.send({ embeds: [embed] });
        info(`Logged promotion embed in #${channel.name} for ${memberName}`);
      } else {
        warn(`Promotion log channel not found in cache: ${promotionLogChannelId}`);
      }
    } else {
      warn(`No promotion log channel configured for guild ${guildId}`);
    }

    // 2. Update member's role
    try {
      if (promotionLogChannelId) {
        await updateMemberRole(memberName, newRank, guild, promotionLogChannelId);
      } else {
        await updateMemberRole(memberName, newRank, guild);
      }
    } catch (roleErr) {
      warn(`Role update failed or member not found for ${memberName}: ${roleErr}`);
    }

    // 3. Save promotion history
    const promotionDate = new Date().toLocaleDateString();
    const timestamp = Date.now();

    await insertPromotionData(
      guildId,
      memberName,
      promotionDate,
      timestamp,
      oldRank,
      newRank
    );

    return res.status(200).send({
      message: `Rank logged for ${memberName}.`
    });
  } catch (err) {
    logError('Error handling /update-rank webhook:', err);
    return res.status(500).send({ error: 'Unexpected error occurred.' });
  }
}