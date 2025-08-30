// Runs when the bot successfully logs in
import { info } from '../utils/logger.js';
import { catchUpPolls } from '../utils/pollUtils.js';
import { scheduleAllCompetitions } from '../schedulers/competitionScheduler.js';

export const name = 'ready';
export const once = true;

export async function execute(client) {
    info(`Logged in as ${client.user.tag}`);

    // Loop through every guild the bot is in
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            // Fetch all members
            await guild.members.fetch();
            info(`Fetched members for guild: ${guild.name}`);

            // Fetch all emojis
            await guild.emojis.fetch();
            info(`Fetched emojis for guild: ${guild.name}`);
        } catch (error) {
            console.error(`Failed to fetch data for guild ${guild.name} (${guild.id}):`, error);
        }
    }
    await catchUpPolls(client);
    await scheduleAllCompetitions(client)
}
