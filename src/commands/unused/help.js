import { SlashCommandBuilder } from 'discord.js';

export const name = 'help';
export const description = 'List all commands';
export const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all commands');
export async function execute(ctx) {
    const helpText = [
        '**Available Commands:**',
        '/divideteams <teams> - Divide into teams',
        '/promo <user> <oldrank> <newrank> - Log a promotion',
        '/help - Show this help message'
    ].join('\n');

    if (ctx.isChatInputCommand) {
        await ctx.reply({ content: helpText, ephemeral: true });
    } else {
        await ctx.reply(helpText);
    }
}
