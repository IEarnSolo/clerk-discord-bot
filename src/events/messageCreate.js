import { WOM_BOT_ID } from '../config.js';
import {
    handleNameChangeMessage,
    handleRankChanges,
    handleMemberJoin,
    handleMemberLeave
} from '../utils/womMessageUtils.js';

/** Event handler for message creation events.
 * Processes messages from the WOM bot to handle name changes, rank changes,
 * member joins, and member leaves.
 * @param {Message} message - The Discord message object
 */
export default {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        if (message.author.id !== WOM_BOT_ID) return;
        if (message.embeds.length === 0) return;

        const embed = message.embeds[0];

        if (embed.title?.includes('Member Name Changed')) {
            await handleNameChangeMessage(message, embed.description);
            return;
        }

        const lines = (embed.description || '').toLowerCase().split('\n');

        if (await handleRankChanges(message, lines)) return;
        if (embed.title?.includes('joined') && await handleMemberJoin(message, lines)) return;
        if (await handleMemberLeave(message, embed)) return;
    }
};