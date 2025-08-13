import { updateMemberRole, isRoleAboveBot } from '../utils/roleUtils.js';
import { insertPromotionData } from '../services/promotionService.js';
import { getGuildChannel } from '../services/channelSettingsService.js';
import { warn } from '../utils/logger.js';

/**
 * Sends a warning message to the specified channel about role hierarchy issues.
 * @param {Guild} guild - The Discord guild
 * @param {string} channelId - The ID of the channel to send the warning to
 */
async function sendHierarchyWarning(guild, channelId) {
    const alertChannel = guild.channels.cache.get(channelId);
    if (!alertChannel) return;

    const helperMsg = `
ℹ️ **Clerk Role Hierarchy Issue Detected**

Go to **Server Settings > Roles** and drag the bot's role above the clan rank roles to fix this.
If the bot's role is already above the clan rank roles, ensure it has the **Manage Roles** permission.

**⚠️ Security Tip:** Do **not** place the bot's role above admin or roles with the Administrator permission. Only allow it to manage roles safe for automation.
    `;
    alertChannel.send(helperMsg).catch(err =>
        warn(`⚠️ Failed to send helper message: ${err.message}`)
    );
}

/**
 * Handles name change messages in the WOM group
 * @param {Message} message - The Discord message object
 * @param {string} description - The embed description containing the name change info
 */
export async function handleNameChangeMessage(message, description) {
    const match = description.match(/`?(.+?)`?\s→\s`?(.+?)`?$/);
    if (!match) return;

    const [ , oldName, newName ] = match.map(s => s.trim());
    const member = message.guild.members.cache.find(m =>
        m.nickname === oldName || m.displayName === oldName || m.user.username === oldName
    );

    const channelId = await getGuildChannel(message.guild.id, 'name_changes_channel_id');
    const alertChannel = channelId ? message.guild.channels.cache.get(channelId) : null;

    if (member) {
        if (channelId) {
            await member.setNickname(newName).then(() => {
                info(`✅ Changed nickname for ${oldName} to ${newName} in guild ${message.guild.name}`);
            }).catch(() => {
                if (alertChannel) alertChannel.send(`⚠️ Could not change nickname for **${oldName}**.`);
            });
        }
    } else if (alertChannel) {
        alertChannel.send(`⚠️ Could not find member **${oldName}** for nickname update.`);
    }
}

/**
 * Handles rank change messages in the WOM group
 * @param {Message} message - The Discord message object
 * @param {string[]} lines - The lines of the embed description
 * @returns {Promise<boolean>} - True if any rank changes were processed
 */
export async function handleRankChanges(message, lines) {
    const changes = lines
        .map(line => line.match(/(.+): `(.+)` <.+> -> `(.+)` <.+>/))
        .filter(Boolean)
        .map(([, memberName, beforeRank, afterRank]) => ({
            memberName,
            beforeRank: formatRank(beforeRank),
            afterRank: formatRank(afterRank)
        }));

    if (changes.length === 0) return false;

    await message.guild.members.fetch();

    const logsChannelId = await getGuildChannel(message.guild.id, 'promotion_logs_channel_id');
    let botMissingRolePerms = false;

    for (const { memberName, beforeRank, afterRank } of changes) {
        if (logsChannelId) {
            const oldRole = message.guild.roles.cache.find(r => r.name === beforeRank);
            const newRole = message.guild.roles.cache.find(r => r.name === afterRank);

            if ((oldRole && await isRoleAboveBot(message.guild, oldRole)) ||
                (newRole && await isRoleAboveBot(message.guild, newRole))) {
                botMissingRolePerms = true;
            }

            await updateMemberRole(memberName, afterRank, message.guild, logsChannelId);
        }

        await insertPromotionData(
            message.guild.id,
            memberName,
            new Date().toLocaleDateString(),
            message.createdTimestamp,
            beforeRank,
            afterRank
        );
    }

    if (botMissingRolePerms && logsChannelId) {
        await sendHierarchyWarning(message.guild, logsChannelId);
    }

    return true;
}

/**
 * Handles member join messages in the WOM group
 * @param {Message} message - The Discord message object
 * @param {string[]} lines - The lines of the embed description
 * @returns {Promise<boolean>} - True if any member joins were processed
 */
export async function handleMemberJoin(message, lines) {
    let processed = false;
    const logsChannelId = await getGuildChannel(message.guild.id, 'join_leave_logs_channel_id');

    for (const line of lines) {
        const match = line.match(/<:([a-z_]+):\d+>\s+(.+)/);
        if (!match) continue;

        const [ , rankEmoji, memberName ] = match;
        const formattedRank = formatRank(rankEmoji);

        if (logsChannelId) {
            await updateMemberRole(memberName, formattedRank, message.guild, logsChannelId);
        }
        processed = true;
    }

    // Check for hierarchy issues properly
    if (logsChannelId) {
        const guildRoles = message.guild.roles.cache;
        for (const line of lines) {
            const match = line.match(/<:([a-z_]+):\d+>\s+(.+)/);
            if (!match) continue;
            const [, rankEmoji] = match;
            const role = guildRoles.find(r => r.name === formatRank(rankEmoji));
            if (role && await isRoleAboveBot(message.guild, role)) {
                await sendHierarchyWarning(message.guild, logsChannelId);
                break; // only send warning once
            }
        }
    }

    return processed;
}

/** * Handles member leave messages in the WOM group
 * @param {Message} message - The Discord message object
 * @param {Embed} embed - The embed object from the message
 * @returns {Promise<boolean>} - True if any member leaves were processed
 */
export async function handleMemberLeave(message, embed) {
    let names = [];
    const single = embed.title.match(/👋 Group member left: (.+)/i);
    if (single) names.push(single[1].trim());

    const multiple = embed.title.match(/👋 \d+ Members have left the group/i);
    if (multiple && embed.description) {
        names = embed.description.match(/`([^`]+)`/g)?.map(n => n.replace(/`/g, '').trim()) || [];
    }
    if (names.length === 0) return false;

    const logsChannelId = await getGuildChannel(message.guild.id, 'join_leave_logs_channel_id');

    for (const name of names) {
        if (logsChannelId) await updateMemberRole(name, 'Guest', message.guild, logsChannelId);
    }

    if (logsChannelId) {
    const guestRole = message.guild.roles.cache.find(r => r.name === 'Guest');
    if (guestRole && await isRoleAboveBot(message.guild, guestRole)) {
        await sendHierarchyWarning(message.guild, logsChannelId);
    }
}

    return true;
}

/**
 * Formats a rank string by replacing underscores and capitalizing words.
 * @param {string} rank - The rank string to format
 * @returns {string} - The formatted rank string
 */
function formatRank(rank) {
    return rank.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}