// utils/messageUtils.js
import { get } from '../services/databaseService.js';

const DEDUPE_WINDOW_MS = 100;

// key -> { timestamp, messageId }
const recentCofferMessages = new Map();

export async function dedupeClanCofferMessages(message) {
  const guildId = message.guild?.id;
  if (!guildId) return false;

  const row = await get(
    `SELECT clan_coffer_channel_id
     FROM channel_settings
     WHERE guild_id = ?`,
    [guildId]
  );

  if (!row?.clan_coffer_channel_id) return false;
  if (message.channel.id !== row.clan_coffer_channel_id) return false;

  const COFFER_REGEX =
    /has (withdrawn|deposited) [\d,]+ coins (from|into) the coffer\./i;

  if (!COFFER_REGEX.test(message.content)) return false;

  const now = Date.now();
  const normalizedContent = message.content.trim().toLowerCase();
  const key = `${message.channel.id}:${normalizedContent}`;

  const existing = recentCofferMessages.get(key);

  // Duplicate detected within window
  if (existing && now - existing.timestamp <= DEDUPE_WINDOW_MS) {
    try {
      await message.delete();
    } catch {
      // ignore perms / already deleted
    }
    return true;
  }

  // Store this message as the canonical one
  recentCofferMessages.set(key, {
    timestamp: now,
    messageId: message.id,
  });

  // Cleanup after window expires
  setTimeout(() => {
    const current = recentCofferMessages.get(key);
    if (current?.messageId === message.id) {
      recentCofferMessages.delete(key);
    }
  }, DEDUPE_WINDOW_MS);

  return false;
}