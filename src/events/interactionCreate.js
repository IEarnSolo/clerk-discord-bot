// Handles all slash command interactions
import { warn, error as _error } from '../utils/logger.js';

/**
 * Event handler for interaction create events.
 * Processes slash command and autocomplete interactions.
 * @param {Interaction} interaction - The Discord interaction object
 * @param {Client} client - The Discord client instance
 */
export const name = 'interactionCreate';
export async function execute(interaction, client) {

    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command && command.autocomplete) {
            await command.autocomplete(interaction);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        warn(`Slash command not found: ${interaction.commandName}`);
        return;
    }

    try {
        interaction.isChatInputCommand = true; // For shared execute() logic
        await command.execute(interaction, []);
    } catch (error) {
        _error(`Error executing slash command ${interaction.commandName}: ${error}`);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'There was an error executing this command.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
        }
    }
}
