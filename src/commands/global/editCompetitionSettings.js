import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { run, get } from '../../services/databaseService.js';
import { Metric, MetricProps } from '@wise-old-man/utils';
import { info, error } from '../../utils/logger.js';
import { toDisplayName } from '../../utils/pollUtils.js';
import { MAIN_COLOR } from '../../config.js';
import { skillsEmoji, combatEmoji } from '../../utils/emojiUtils.js';

// Grab metric keys for skills and bosses
const SKILLS = Object.values(Metric).filter(m => MetricProps[m]?.type === 'skill');
const BOSSES = Object.values(Metric).filter(m => MetricProps[m]?.type === 'boss');

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
}

function getSkillsForPage(page) {
  const pageSize = 25;
  const start = (page) * pageSize;
  const end = start + pageSize;
  return SKILLS.slice(start, end);
}

function getBossesForPage(page) {
  const pageSize = 25;
  const start = (page) * pageSize;
  const end = start + pageSize;
  return BOSSES.slice(start, end);
}


const SKILL_CHUNKS = chunkArray(SKILLS, 25);
const BOSS_CHUNKS = chunkArray(BOSSES, 25);

export default {
  data: new SlashCommandBuilder()
    .setName('edit-competition-settings')
    .setDescription('Edit this server\'s competition settings. Leave the options blank for skill and boss blacklist menus')
    .addRoleOption(opt =>
        opt.setName('clan_events_role')
        .setDescription('Role to mention for competitions')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
        opt.setName('tiebreaker_poll_duration')
        .setDescription('Number of days for the tiebreaker poll')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addIntegerOption(opt =>
        opt.setName('days_after_poll')
        .setDescription('Number of days between the competition poll ending and competition starting')
        .setAutocomplete(true)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const guildId = interaction.guildId;

    if (focused.name === 'days_after_poll' || focused.name === 'tiebreaker_poll_duration') {
      const typedValue = focused.value;

      // If user has started typing, don't suggest anything
      if (typedValue && typedValue.length > 0) {
        return interaction.respond([]);
      }

      // Fetch current value from DB
      try {
        const row = await get(
          `SELECT days_after_poll, tiebreaker_poll_duration FROM competition_settings WHERE guild_id = ?`,
          [guildId]
        );

        const value = focused.name === 'days_after_poll'
          ? row?.days_after_poll
          : row?.tiebreaker_poll_duration;

        if (value != null) {
          return interaction.respond([
            { name: `${value}`, value: String(value) }
          ]);
        }
      } catch (err) {
        error('Autocomplete DB fetch failed', err);
      }

      // Default suggestion if nothing in DB
      return interaction.respond([{ name: 'Not set (default 3)', value: '3' }]);
    }
  },

  async execute(interaction) {
    const guildId = interaction.guildId;
    const username = interaction.user.username;
    const clanEventsRole = interaction.options.getRole('clan_events_role');
    const tiebreakerPollDuration = interaction.options.getInteger('tiebreaker_poll_duration');
    const daysAfterPoll = interaction.options.getInteger('days_after_poll');

    try {
      let updates = [];
      const embedTitle = `Competition Settings Updated`;

      if (clanEventsRole) {
        await run(
          `
          INSERT INTO competition_settings (guild_id, clan_events_role_id)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET clan_events_role_id = excluded.clan_events_role_id
          `,
          [guildId, clanEventsRole.id]
        );
        updates.push(`Clan Events Role → <@&${clanEventsRole.id}>`);
      }

      if (tiebreakerPollDuration != null) {
        await run(
          `
          INSERT INTO competition_settings (guild_id, tiebreaker_poll_duration)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET tiebreaker_poll_duration = excluded.tiebreaker_poll_duration
          `,
          [guildId, tiebreakerPollDuration]
        );
        updates.push(`Tiebreaker Poll Duration → ${tiebreakerPollDuration}`);
      }

      if (daysAfterPoll != null) {
        await run(
          `
          INSERT INTO competition_settings (guild_id, days_after_poll)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET days_after_poll = excluded.days_after_poll
          `,
          [guildId, daysAfterPoll]
        );
        updates.push(`Days After Poll → ${daysAfterPoll}`);
      }

      // If any updates, reply and return early
      if (updates.length > 0) {
        const embed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(updates.join('\n'))
          .setColor(MAIN_COLOR);

        await interaction.reply({ embeds: [embed], ephemeral: true });
        info(`${embedTitle} by ${username}: ${updates.join(', ')}`);
        return;
      }

      // ...continue to blacklist editing menu if no params were provided


      // Fetch current blacklists
      const row = await get(
        `SELECT skill_blacklist, boss_blacklist FROM competition_settings WHERE guild_id = ?`,
        [guildId]
      );
      const currentSkills = row?.skill_blacklist ? row.skill_blacklist.split(',') : [];
      const currentBosses = row?.boss_blacklist ? row.boss_blacklist.split(',') : [];

      // Show first page of skills
      const page = 0;
      const embed = new EmbedBuilder()
        .setColor(MAIN_COLOR)
        .setTitle('Edit Competition Settings - Skills')
        .setDescription(`${skillsEmoji} Select skills to blacklist.\n` +
            `Skills chosen here will not appear in competition polls.`)
        .setFooter({ text: `Page ${page + 1}/${SKILL_CHUNKS.length}`});

      const skillSelect = new StringSelectMenuBuilder()
        .setCustomId(`skill_page_${page}`)
        .setPlaceholder('Select skills to blacklist')
        .setMinValues(0)
        .setMaxValues(SKILL_CHUNKS[page].length)
        .addOptions(
          SKILL_CHUNKS[page].map(skill => ({
            label: toDisplayName(skill),
            value: skill,
            default: currentSkills.includes(skill)
          }))
        );

      const skillRow = new ActionRowBuilder().addComponents(skillSelect);

      const skillButtons = [];
      if (SKILL_CHUNKS.length > 1) {
        skillButtons.push(
          new ButtonBuilder()
            .setCustomId(`skill_prev_${page}`)
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );
        skillButtons.push(
          new ButtonBuilder()
          .setCustomId(`skill_next_${page}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
        );
      }

      // Add nav row (skills active by default)
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('show_skills')
        .setLabel('📊 Skills')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),

        new ButtonBuilder()
        .setCustomId('show_bosses')
        .setLabel('💀 Bosses')
        .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [skillRow, ...(skillButtons.length ? [new ActionRowBuilder().addComponents(skillButtons)] : []), navRow],
        ephemeral: true
      });

      info(`[CompetitionSettings] Opened interactive blacklist editor for ${username} in guild ${guildId}`);
    } catch (err) {
      error(`[CompetitionSettings] Failed: ${err.message}`);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ Failed to open blacklist editor.', ephemeral: true });
      }
    }
  }
};

// --- Component Interaction Handler ---
export async function handleCompetitionSettingsInteraction(interaction) {
  if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
  const guildId = interaction.guildId;
  const username = interaction.user.username;

  const row = await get(`SELECT skill_blacklist, boss_blacklist FROM competition_settings WHERE guild_id = ?`, [guildId]);
  const currentSkills = row?.skill_blacklist ? row.skill_blacklist.split(',') : [];
  const currentBosses = row?.boss_blacklist ? row.boss_blacklist.split(',') : [];

  // ----- SKILL SELECT MENU -----
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('skill_page_')) {
    const selected = interaction.values;
    //const username = interaction.member?.nickname || interaction.member?.displayName || interaction.user.username;

    // --- Step 1: Fetch current blacklist from DB ---
    const row = await get(
        `SELECT skill_blacklist FROM competition_settings WHERE guild_id = ?`,
        [guildId]
    );

    let dbBlacklist = row?.skill_blacklist ? row.skill_blacklist.split(',').filter(s => s) : [];
    //console.log(`[DEBUG] Blacklist from DB before update:`, dbBlacklist);

    // --- Step 2: Remove deselected skills only from this page ---
    const page = parseInt(interaction.customId.split('_').pop());
    const pageSkills = getSkillsForPage(page); // 25 skills for this page

    const beforeRemove = [...dbBlacklist];
    dbBlacklist = dbBlacklist.filter(skill => {
        if (!pageSkills.includes(skill)) return true; // keep skills from other pages
        return selected.includes(skill); // keep if still selected
    });
    const removed = beforeRemove.filter(s => !dbBlacklist.includes(s));
    //console.log(`[DEBUG] Blacklist after removing deselected (removed: ${removed}):`, dbBlacklist);

    // --- Step 3: Add newly selected skills from this page ---
    let added = [];
    pageSkills.forEach(skill => {
        if (selected.includes(skill) && !dbBlacklist.includes(skill)) {
            dbBlacklist.push(skill);
            added.push(skill);
        }
    });
    //console.log(`[DEBUG] Added skills on this page:`, added);
    //console.log(`[DEBUG] Blacklist after adding new selections:`, dbBlacklist);

    // --- Step 4: Save updated blacklist back to DB ---
    await run(
        `
        INSERT INTO competition_settings (guild_id, skill_blacklist)
        VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET skill_blacklist = excluded.skill_blacklist
        `,
        [guildId, dbBlacklist.join(',')]
    );

    //console.log(`[DEBUG] Final blacklist saved to DB:`, dbBlacklist);

    // --- Step 5: Log who made the changes ---
    /* if (added.length || removed.length) {
        console.log(`[Skill Blacklist Update] User: ${username} | Added: ${added.length ? added.join(', ') : 'None'} | Removed: ${removed.length ? removed.join(', ') : 'None'}`);
    } */

    if (added.length > 0) {
        info(`[Blacklist Update] ${username} added: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
        info(`[Blacklist Update] ${username} removed: ${removed.join(', ')}`);
    }
    if (added.length === 0 && removed.length === 0) {
        info(`[Blacklist Update] ${username} made no changes.`);
    }

    info(`[Blacklist Update] New skill blacklist: ${dbBlacklist.join(', ')}`);


    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: '✅ Updated skills blacklist!' });
    return;
}

  // ----- SKILL PAGINATION BUTTONS -----
  if (interaction.isButton() && interaction.customId.startsWith('skill_')) {
    await interaction.deferUpdate();
    let [_, direction, currentPage] = interaction.customId.split('_');
    currentPage = parseInt(currentPage, 10);
    let newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
    if (newPage < 0 || newPage >= SKILL_CHUNKS.length) return;

    const skillSelect = new StringSelectMenuBuilder()
      .setCustomId(`skill_page_${newPage}`)
      .setPlaceholder('Select skills to blacklist')
      .setMinValues(0)
      .setMaxValues(SKILL_CHUNKS[newPage].length)
      .addOptions(
        SKILL_CHUNKS[newPage].map(skill => ({
          label: toDisplayName(skill),
          value: skill,
          default: currentSkills.includes(skill)
        }))
      );

    const skillRow = new ActionRowBuilder().addComponents(skillSelect);

    const skillButtons = [];
    skillButtons.push(
      new ButtonBuilder()
        .setCustomId(`skill_prev_${newPage}`)
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(newPage === 0)
    );
    skillButtons.push(
      new ButtonBuilder()
        .setCustomId(`skill_next_${newPage}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(newPage === SKILL_CHUNKS.length - 1)
    );

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
      .setCustomId('show_skills')
      .setLabel('📊 Skills')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),

      new ButtonBuilder()
      .setCustomId('show_bosses')
      .setLabel('💀 Bosses')
      .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(MAIN_COLOR)
          .setTitle('Edit Competition Settings - Skills')
          .setDescription(`${skillsEmoji} Select skills to blacklist.\n` +
            `Skills chosen here will not appear in competition polls.`)
          .setFooter({ text: `Page ${newPage + 1}/${SKILL_CHUNKS.length}`})
      ],
      components: [skillRow, new ActionRowBuilder().addComponents(skillButtons), navRow]
    });
    return;
  }

  // ----- BOSS SELECT MENU -----
if (interaction.isStringSelectMenu() && interaction.customId.startsWith('boss_page_')) {
    const selected = interaction.values; // currently selected on this page
    const page = parseInt(interaction.customId.split('_').pop());
    const pageBosses = getBossesForPage(page); // 25 bosses for this page

    /* console.log(`[DEBUG] Interaction from guild ${guildId}`);
    console.log(`[DEBUG] Current page: ${page}`);
    console.log(`[DEBUG] Bosses on this page:`, pageBosses);
    console.log(`[DEBUG] Selected values from interaction:`, selected); */

    // Fetch current blacklist from DB
    const row = await get(
        `SELECT boss_blacklist FROM competition_settings WHERE guild_id = ?`,
        [guildId]
    );

    let dbBlacklist = row?.boss_blacklist ? row.boss_blacklist.split(',').filter(b => b) : [];
    //console.log(`[DEBUG] Blacklist from DB before update:`, dbBlacklist);

    // --- Step 1: Remove deselected bosses only from this page ---
    const beforeRemove = [...dbBlacklist];
    dbBlacklist = dbBlacklist.filter(boss => {
        if (!pageBosses.includes(boss)) return true; // keep bosses from other pages
        return selected.includes(boss); // keep if still selected
    });
    const removed = beforeRemove.filter(b => !dbBlacklist.includes(b));
    //console.log(`[DEBUG] Blacklist after removing deselected (removed: ${beforeRemove.filter(b => !dbBlacklist.includes(b))}):`, dbBlacklist);

    // --- Step 2: Add newly selected bosses from this page ---
    let added = [];
    pageBosses.forEach(boss => {
        if (selected.includes(boss) && !dbBlacklist.includes(boss)) {
            dbBlacklist.push(boss);
            added.push(boss);
        }
    });
    //console.log(`[DEBUG] Added bosses on this page:`, added);
    //console.log(`[DEBUG] Blacklist after adding new selections:`, dbBlacklist);

    // --- Step 3: Save updated blacklist back to DB ---
    await run(
        `
        INSERT INTO competition_settings (guild_id, boss_blacklist)
        VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET boss_blacklist = excluded.boss_blacklist
        `,
        [guildId, dbBlacklist.join(',')]
    );

    //console.log(`[DEBUG] Final blacklist saved to DB:`, dbBlacklist);

        // --- Custom logging of added/removed bosses ---
    if (added.length > 0) {
        info(`[Blacklist Update] ${username} added: ${added.join(', ')}`);
    }
    if (removed.length > 0) {
        info(`[Blacklist Update] ${username} removed: ${removed.join(', ')}`);
    }
    if (added.length === 0 && removed.length === 0) {
        info(`[Blacklist Update] ${username} made no changes.`);
    }

    info(`[Blacklist Update] New boss blacklist: ${dbBlacklist.join(', ')}`);

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: '✅ Updated bosses blacklist!' });
    return;
}


  // ----- BOSS PAGINATION BUTTONS -----
  if (interaction.isButton() && interaction.customId.startsWith('boss_')) {
    await interaction.deferUpdate();
    let [_, direction, currentPage] = interaction.customId.split('_');
    currentPage = parseInt(currentPage, 10);
    let newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
    if (newPage < 0 || newPage >= BOSS_CHUNKS.length) return;

    const bossSelect = new StringSelectMenuBuilder()
      .setCustomId(`boss_page_${newPage}`)
      .setPlaceholder('Select bosses to blacklist')
      .setMinValues(0)
      .setMaxValues(BOSS_CHUNKS[newPage].length)
      .addOptions(
        BOSS_CHUNKS[newPage].map(boss => ({
          label: toDisplayName(boss),
          value: boss,
          default: currentBosses.includes(boss)
        }))
      );

    const bossRow = new ActionRowBuilder().addComponents(bossSelect);

    const bossButtons = [];
    bossButtons.push(
      new ButtonBuilder()
        .setCustomId(`boss_prev_${newPage}`)
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(newPage === 0)
    );

    bossButtons.push(
      new ButtonBuilder()
        .setCustomId(`boss_next_${newPage}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(newPage === BOSS_CHUNKS.length - 1)
    );

    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
      .setCustomId('show_skills')
      .setLabel('📊 Skills')
      .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
      .setCustomId('show_bosses')
      .setLabel('💀 Bosses')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)
    );

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('Purple')
          .setTitle('Edit Competition Settings - Bosses')
          .setDescription(`${combatEmoji} Select bosses to blacklist.\n` +
            `Bosses chosen here will not appear in competition polls.`)
          .setFooter({ text: `Page ${newPage + 1}/${BOSS_CHUNKS.length}`})
      ],
      components: [bossRow, navRow, new ActionRowBuilder().addComponents(bossButtons)]
    });
    return;
  }

  // ----- TAB SWITCHING -----
  if (interaction.isButton() && (interaction.customId === 'show_skills' || interaction.customId === 'show_bosses')) {
    await interaction.deferUpdate();
    if (interaction.customId === 'show_skills') {
      const page = 0;
      const skillSelect = new StringSelectMenuBuilder()
        .setCustomId(`skill_page_${page}`)
        .setPlaceholder('Select skills to blacklist')
        .setMinValues(0)
        .setMaxValues(SKILL_CHUNKS[page].length)
        .addOptions(
          SKILL_CHUNKS[page].map(skill => ({
            label: toDisplayName(skill),
            value: skill,
            default: currentSkills.includes(skill)
          }))
        );

      const skillRow = new ActionRowBuilder().addComponents(skillSelect);
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('show_skills')
        .setLabel('📊 Skills')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),

        new ButtonBuilder()
        .setCustomId('show_bosses')
        .setLabel('💀 Bosses')
        .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(MAIN_COLOR)
            .setTitle('Edit Competition Settings - Skills')
            .setDescription(`${skillsEmoji} Select skills to blacklist.\n` +
            `Skills chosen here will not appear in competition polls.`)
            .setFooter({ text: `Page ${page + 1}/${SKILL_CHUNKS.length}`})
        ],
        components: [skillRow, navRow]
      });
    }

    if (interaction.customId === 'show_bosses') {
      const page = 0;
      const bossSelect = new StringSelectMenuBuilder()
        .setCustomId(`boss_page_${page}`)
        .setPlaceholder('Select bosses to blacklist')
        .setMinValues(0)
        .setMaxValues(BOSS_CHUNKS[page].length)
        .addOptions(
          BOSS_CHUNKS[page].map(boss => ({
            label: toDisplayName(boss),
            value: boss,
            default: currentBosses.includes(boss)
          }))
        );

      const bossRow = new ActionRowBuilder().addComponents(bossSelect);
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('show_skills')
        .setLabel('📊 Skills')
        .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
        .setCustomId('show_bosses')
        .setLabel('💀 Bosses')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
      );

      const bossButtons = [];
        bossButtons.push(
        new ButtonBuilder()
            .setCustomId(`boss_prev_${page}`)
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0)
        );
        bossButtons.push(
        new ButtonBuilder()
            .setCustomId(`boss_next_${page}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === BOSS_CHUNKS.length - 1)
        );

        await interaction.editReply({
        embeds: [
            new EmbedBuilder()
            .setColor('Purple')
            .setTitle('Edit Competition Settings - Bosses')
            .setDescription(`${combatEmoji} Select bosses to blacklist.\n` +
            `Bosses chosen here will not appear in competition polls.`)
            .setFooter({ text: `Page ${page + 1}/${BOSS_CHUNKS.length}`})
        ],
        components: [bossRow, navRow, new ActionRowBuilder().addComponents(bossButtons)]
        });
    }
  }
}
