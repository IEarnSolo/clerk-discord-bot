import { SlashCommandBuilder } from 'discord.js';
import { TEAM_EMOJI } from '../../config.js';
import { divideTeams } from '../../utils/teamUtils.js';
import { info } from '../../utils/logger.js';

export const name = 'divideteams';
export const description = 'Divide members into balanced teams';
export const data = new SlashCommandBuilder()
    .setName('divideteams')
    .setDescription('Divide members into balanced teams')
    .addIntegerOption(option => option.setName('teams')
        .setDescription('Number of teams')
        .setRequired(true)
    );
export async function execute(ctx, args) {
    // Detect whether it's a slash or message command
    const isInteraction = !!ctx.isChatInputCommand;
    const numberOfTeams = isInteraction
        ? ctx.options.getInteger('teams')
        : parseInt(args[0], 10);

    if (!numberOfTeams || numberOfTeams < 2) {
        const reply = 'Please specify a valid number of teams (at least 2).';
        if (isInteraction) return ctx.reply({ content: reply, ephemeral: true });
        else return ctx.reply(reply);
    }

    // Use utility to divide teams
    const result = divideTeams(ctx.guild, numberOfTeams, TEAM_EMOJI);

    if (isInteraction) {
        await ctx.reply(result);
    } else {
        await ctx.reply(result);
    }

    info(`Divided members into ${numberOfTeams} teams.`);
}
