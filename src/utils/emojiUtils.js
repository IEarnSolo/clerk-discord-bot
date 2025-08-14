// src/utils/emojiUtils.js
import fs from 'fs';
import path from 'path';
import { info, warn, error as logError } from './logger.js';
import { RANK_IMAGES_FOLDER } from '../config.js';

/**
 * Parses a Discord emoji string and returns its name and ID.
 * Works for both animated and static custom emojis.
 *
 * @param {string} emojiString - The emoji string (e.g., "<:smile:123456789012345678>")
 * @returns {{ name: string|null, id: string|null }} The parsed emoji data
 */
export function parseEmoji(emojiString) {
  const regex = /<a?:(\w+):(\d+)>/; // Match both regular and animated custom emojis
  const match = emojiString.match(regex);

  if (match) {
    return { name: match[1], id: match[2] };
  }

  // If no match, it’s probably a Unicode emoji
  return { name: emojiString, id: null };
}

/**
 * Get the Discord emoji for a given rank name.
 * Fetches the application's own emojis and matches by name.
 * Returns the emoji string in the format `<:name:id>` or an empty string if not found.
 * @param {string} rankName - The name of the rank (e.g., "Gnome Child")
 * @param {object} client - The Discord client instance
 * @returns {Promise<string>} The emoji string or empty string if not found
 */
export async function getEmojiForRank(rankName, client) {
  if (!rankName) return '';

  const formattedRankName = rankName.toLowerCase().replace(/\s+/g, '_');

  try {
    // Fetch the application's own emojis
    const emojis = await client.application.emojis.fetch();
    const emoji = emojis.find(e => e.name.toLowerCase() === formattedRankName);

    if (!emoji) {
      info(`Emoji not found for rank: "${rankName}" (Searched as: "${formattedRankName}")`);
      return '';
    }

    return `<:${emoji.name}:${emoji.id}>`;
  } catch (error) {
    logError('Error fetching application emojis:', error);
    return '';
  }
}

/** Create a guild emoji for a rank from a local image file.
 * Skips creation if an emoji with the same name already exists.
 * Returns the created or existing emoji.
 * @param {Guild} guild - The Discord guild
 * @param {string} rankName - The name of the rank (e.g., "Gnome Child")
 * @param {string} imagePath - Path to the local PNG image file
 * @returns {Promise<GuildEmoji>} The created or existing guild emoji
 */
export async function createRankEmoji(guild, rankName, imagePath) {
  const emojiName = rankName.replace(/[\s-]+/g, '_').slice(0, 32).toLowerCase();
  await guild.emojis.cache.clear(); 
  await guild.emojis.fetch(); // Refresh emoji cache

  let emoji = guild.emojis.cache.find(e => e.name === emojiName);
  if (!emoji) {
    emoji = await guild.emojis.create({
      name: emojiName,
      attachment: imagePath,
    });
  }

  return emoji;
}

/** Upload all PNG images in the emoji assets folder as application emojis.
 * Skips images if an emoji with the same name already exists.
 * Names are derived from filenames by replacing spaces and hyphens with underscores, lowercased.
 * @param {object} client - The Discord client instance
 * @returns {Promise<void>}
 */ 
export async function createApplicationRankEmojis(client) {
  // Get list of existing application emojis
  const existingEmojis = await client.application.emojis.fetch();
  const existingNames = new Set(existingEmojis.map(e => e.name));

  const files = fs.readdirSync(RANK_IMAGES_FOLDER).filter(f => /\.png$/i.test(f));

  for (const filename of files) {
    // Replace spaces AND hyphens with underscores, lowercased
    const name = path
      .parse(filename)
      .name
      .replace(/[\s-]+/g, '_') // spaces or hyphens → underscore
      .toLowerCase();

    // Skip if emoji with same name already exists
    if (existingNames.has(name)) {
      info(`⏩ Skipping existing emoji: ${name}`);
      continue;
    }

    const filePath = path.join(RANK_IMAGES_FOLDER, filename);

    try {
      await client.application.emojis.create({
        attachment: filePath,
        name
      });
      info(`✅ Uploaded application emoji: ${name}`);
    } catch (err) {
      warn(`❌ Failed to upload emoji '${name}':`, err.message);
    }

    // Delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

