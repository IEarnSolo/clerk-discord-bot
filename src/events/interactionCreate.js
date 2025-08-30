// Handles all slash command and component interactions
import { warn, error as _error } from '../utils/logger.js';
import { handleCompetitionSettingsInteraction } from '../commands/global/editCompetitionSettings.js';

export const name = 'interactionCreate';
export async function execute(interaction, client) {

    try {
        // Autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command && command.autocomplete) {
                await command.autocomplete(interaction);
            }
            return;
        }

        if (interaction.isStringSelectMenu() || interaction.isButton()) {
            // Handle skill or boss component interactions
            if (interaction.customId.startsWith('show_skills') ||
                interaction.customId.startsWith('skill_page_') ||
                interaction.customId.startsWith('skill_prev_') ||
                interaction.customId.startsWith('skill_next_') ||
                interaction.customId.startsWith('show_bosses') ||
                interaction.customId.startsWith('boss_page_') ||
                interaction.customId.startsWith('boss_prev_') ||
                interaction.customId.startsWith('boss_next_')) {
                await handleCompetitionSettingsInteraction(interaction);
                return;
            }

            // You can add more component handlers here as needed
            return;
        }

        // Chat input (slash) commands
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) {
            warn(`Slash command not found: ${interaction.commandName}`);
            return;
        }

        interaction.isChatInputCommand = true; // For shared execute() logic
        await command.execute(interaction, []);

    } catch (err) {
        _error(`Error processing interaction: ${err}`);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'There was an error processing this interaction.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error processing this interaction.', ephemeral: true });
        }
    }
}