import { info, error as logError, warn } from '../utils/logger.js';
import path from 'path';
import fs from 'fs';
import { RANK_IMAGES_FOLDER } from '../config.js';
import { createRankEmoji } from './emojiUtils.js';
import { getAverageColor } from './imageUtils.js';
import { womClient } from '../services/womClient.js';
import { getWomGroupId } from '../services/clanGuildLinksService.js';

/**
 * Updates a member's role based on their new rank.
 * @param {string} memberName - The name of the member (nickname, displayName, or username).
 * @param {string} newRoleName - The name of the new role to assign.
 * @param {Guild} guild - The Discord guild object.
 * @param {string|null} alertChannelId - Optional channel ID to send alerts if member
 * is not found or if role changes cannot be made.
 */
export async function updateMemberRole(memberName, newRoleName, guild, alertChannelId = null) {
    info(`Searching for member: "${memberName}"`);

    let member = findMemberByName(guild, memberName);

    if (!member) {
        info(`Member "${memberName}" not found after all attempts.`);
        if (alertChannelId) {
            sendAlert(guild, alertChannelId, memberName, newRoleName);
        }
        return;
    }

    const newRole = guild.roles.cache.find(role => role.name === newRoleName);
    if (!newRole) {
        info(`Role "${newRoleName}" not found in the server.`);
        return;
    }

    await assignNewRole(member, newRole, guild, alertChannelId);
    await removeOldRankRoles(member, guild, newRoleName, alertChannelId);
}

/**
 * Fetches the rank of a Discord member from WOM and assigns the appropriate role.
 * @param {GuildMember} discordMember - The Discord guild member to process.
 */
export async function fetchRankAndAssignRole(discordMember) {
  try {
    const guildId = discordMember.guild.id;
    const womGroupId = await getWomGroupId(guildId);

    if (!womGroupId) {
      warn(`No WOM group ID found for guild: ${guildId}. Skipping role assignment.`);
      return;
    }

    // Fetch WOM group details
    const group = await womClient.groups.getGroupDetails(womGroupId);

    // Generate all possible name variations from the Discord member
    const namesToMatch = [
    discordMember.user.username,
    discordMember.displayName,
    discordMember.nickname
    ]
    .filter(Boolean)
    .map(name => name.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' '));

    // Find matching WOM member using player.username (canonical format)
    const matchedMembership = group.memberships.find(m => {
    const groupUsername = m.player.username; // already lowercase + underscores/dashes normalized by WOM
    return groupUsername && namesToMatch.includes(groupUsername);
    });

    if (!matchedMembership) {
    warn(`No matching WOM member found for ${discordMember.user.username}`);
    return;
    }

    info(`Matched WOM member: ${matchedMembership.player.username} (${matchedMembership.role})`);

    const newRoleName = formatRoleName(matchedMembership.role);

    // Pass canonical username here
    await updateMemberRole(matchedMembership.player.username, newRoleName, discordMember.guild);
  } catch (err) {
    logError(`Error in fetchRankAndAssignRole: ${err}`);
  }
}

/**
 * Attempts to find a guild member by various name matching strategies.
 * @param {Guild} guild - The Discord guild object.
 * @param {string} memberName - The name of the member to find.
 * @returns {GuildMember|null} - The found member or null if not found.
 */
function findMemberByName(guild, memberName) {
    // Try exact match
    let member = guild.members.cache.find(m => 
        m.nickname === memberName || 
        m.displayName === memberName || 
        m.user.username === memberName
    );
    if (member) return member;

    // Try case-insensitive match
    member = guild.members.cache.find(m => 
        m.nickname?.toLowerCase() === memberName.toLowerCase() || 
        m.displayName?.toLowerCase() === memberName.toLowerCase() || 
        m.user.username.toLowerCase() === memberName.toLowerCase()
    );
    if (member) return member;

    // Try underscores for spaces
    const normalized = memberName.toLowerCase().replace(/ /g, '_');
    return guild.members.cache.find(m => 
        m.nickname?.toLowerCase() === normalized || 
        m.displayName?.toLowerCase() === normalized || 
        m.user.username.toLowerCase() === normalized
    );
}

/** Assigns a new role to a member if not already assigned and manageable.
 * @param {GuildMember} member - The guild member to update.
 * @param {Role} newRole - The new role to assign.
 * @param {Guild} guild - The Discord guild object.
 * @param {string|null} alertChannelId - Optional channel ID to send alerts if role
 * cannot be assigned.
 */
async function assignNewRole(member, newRole, guild, alertChannelId = null) {
  if (!member.roles.cache.has(newRole.id) && !(await isRoleAboveBot(guild, newRole))) {
    await member.roles.add(newRole);
    info(`✅ Assigned role "${newRole.name}" to ${member.user.username}`);
  } else if (await isRoleAboveBot(guild, newRole)) {
    const msg = `⚠️ Cannot assign role "${newRole.name}" to ${member.user.username} — it is higher than the bot's role.`;
    warn(msg);

    if (alertChannelId) {
      const alertChannel = guild.channels.cache.get(alertChannelId);
      if (alertChannel) {
        alertChannel.send(msg).catch(err =>
          warn(`⚠️ Failed to send alert message: ${err.message}`)
        );
      }
    }
  }
}

/** Removes old rank roles from a member, except for the specified role to keep.
 * @param {GuildMember} member - The guild member to update.
 * @param {Guild} guild - The Discord guild object.
 * @param {string} keepRoleName - The name of the role to keep.
 * @param {string|null} alertChannelId - Optional channel ID to send alerts if roles
 * cannot be removed.
 */
async function removeOldRankRoles(member, guild, keepRoleName, alertChannelId = null) {
  const rankRoles = fs.readdirSync(RANK_IMAGES_FOLDER).map(file => path.parse(file).name);

  const allTargetRoles = guild.roles.cache.filter(role =>
    rankRoles.includes(role.name) &&
    role.name !== keepRoleName &&
    member.roles.cache.has(role.id)
  );

  const { manageable: rolesToRemove, blocked: blockedRoles } = await splitManageableRoles(guild, allTargetRoles);

  if (rolesToRemove.size > 0) {
    await member.roles.remove(rolesToRemove);
    info(`Removed roles: ${rolesToRemove.map(r => r.name).join(', ')} from ${member.user.username}`);
  }

  if (blockedRoles.size > 0 && alertChannelId) {
    const msg = `⚠️ Cannot remove role(s) ${blockedRoles.map(r => `"${r.name}"`).join(', ')} from ${member.user.username} — they are higher than the bot's role.`;
    warn(msg);

    const alertChannel = guild.channels.cache.get(alertChannelId);
    if (alertChannel) {
      alertChannel.send(msg).catch(err =>
        warn(`⚠️ Failed to send alert message: ${err.message}`)
      );
    }
  }
}

/** Sends an alert message to a specified channel if a member is not found.
 * @param {Guild} guild - The Discord guild object.
 * @param {string} channelId - The ID of the channel to send the alert to.
 * @param {string} memberName - The name of the member that was not found.
 * @param {string} newRoleName - The name of the role that was to be assigned.
 */
function sendAlert(guild, channelId, memberName, newRoleName) {
    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        channel.send(`Member "${memberName}" not found while processing rank change to "${newRoleName}".`);
    }
}

/**
 * Checks if a role is above or equal to the bot's highest role in the guild.
 * @param {Guild} guild - The Discord guild object.
 * @param {Role} role - The role to check.
 * @returns {Promise<boolean>} - True if the bot CANNOT manage this role.
 */
export async function isRoleAboveBot(guild, role) {
  if (!guild || !role) return true; // Fail safe — treat as unmanageable

  const botHighestRole = (await guild.members.fetchMe()).roles.highest;
  return role.comparePositionTo(botHighestRole) >= 0;
}

/**
 * Checks multiple roles against the bot's highest role in the guild.
 * @param {Guild} guild - The Discord guild object.
 * @param {Collection<string, Role>} roles - The roles to check.
 * @returns {Promise<{manageable: Collection, blocked: Collection}>}
 */
export async function splitManageableRoles(guild, roles) {
  const botHighestRole = (await guild.members.fetchMe()).roles.highest;

  const manageable = roles.filter(role => role.comparePositionTo(botHighestRole) < 0);
  const blocked = roles.filter(role => role.comparePositionTo(botHighestRole) >= 0);

  return { manageable, blocked };
}

/**
 * Creates a rank role (and optionally an emoji) in a guild.
 * @param {Guild} guild - The Discord guild
 * @param {string} rankName - Name of the rank (must match a PNG in rankimages folder)
 * @param {boolean} createEmoji - Whether to create an emoji for this rank
 * @returns {Promise<{ role: Role, emoji: GuildEmoji | null }>}
 */
export async function createRankRole(guild, rankName, createEmoji) {
    try {
        const imagePath = path.join(RANK_IMAGES_FOLDER, `${rankName}.png`);

        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image for rank "${rankName}" not found.`);
        }

        const hexColor = await getAverageColor(imagePath);

        const hasRoleIcons = guild.features.includes('ROLE_ICONS');
        const roleOptions = {
            name: rankName,
            color: hexColor,
            reason: `Created rank role for "${rankName}"`,
        };

        if (hasRoleIcons) {
            roleOptions.icon = imagePath;
        }

        let role = guild.roles.cache.find(r => r.name === rankName);
        if (!role) {
            role = await guild.roles.create(roleOptions);
        }

        let emoji = null;
        if (createEmoji) {
            emoji = await createRankEmoji(guild, rankName, imagePath);
        }

        return { role, emoji };
    } catch (err) {
        logError(`Error creating rank role: ${err.message}`);
        throw err;
    }
}

/** * Formats a role name to a more readable format.
 * Converts underscores to spaces and capitalizes each word.
 * @param {string} role - The role name to format.
 * @returns {string} - The formatted role name.
 */
function formatRoleName(role) {
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}