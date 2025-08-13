import { get, run } from '../services/databaseService.js';
import { info, error as logError } from '../utils/logger.js';

/** Retrieve the welcome message for a given guild.
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string|null>} - The welcome message or null if not set
 */
export async function getWelcomeMessage(guildId) {
    const result = await get(
        `SELECT message FROM welcome_messages WHERE guildId = ?`,
        [guildId]
    );
    return result?.message || null;
}

/**
 * Set or update the welcome message for a given guild.
 * @param {string} guildId - Discord guild ID
 * @param {string} message - The welcome message to set
 */
export async function setWelcomeMessage(guildId, message) {
    try {
        await run(
            `INSERT INTO welcome_messages (guildId, message) VALUES (?, ?)
             ON CONFLICT(guildId) DO UPDATE SET message = ?`,
            [guildId, message, message]
        );
        info(`Set welcome message for guild ${guildId}`);
    } catch (err) {
        logError(`Error setting welcome message for guild ${guildId}: ${err.message}`);
    }
}
