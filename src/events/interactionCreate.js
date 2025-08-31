// Handles all slash command and component interactions
import { handleAddNoteModal } from '../commands/global/addNote.js';
import { handleCompetitionSettingsInteraction } from '../commands/global/editCompetitionSettings.js';
import { error as _error, warn } from '../utils/logger.js';

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

        // Select menus & buttons
        if (interaction.isStringSelectMenu() || interaction.isButton()) {
            if (
                interaction.customId.startsWith('show_skills') ||
                interaction.customId.startsWith('skill_page_') ||
                interaction.customId.startsWith('skill_prev_') ||
                interaction.customId.startsWith('skill_next_') ||
                interaction.customId.startsWith('show_bosses') ||
                interaction.customId.startsWith('boss_page_') ||
                interaction.customId.startsWith('boss_prev_') ||
                interaction.customId.startsWith('boss_next_')
            ) {
                await handleCompetitionSettingsInteraction(interaction);
                return;
            }
            return;
        }

        // Modal submissions
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('add_note_modal-')) {
                await handleAddNoteModal(interaction);
                return;
            }
            return;
        }

        // Context menu (message/user) commands
        if (interaction.isMessageContextMenuCommand() || interaction.isUserContextMenuCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                warn(`Context menu command not found: ${interaction.commandName}`);
                return;
            }

            await command.execute(interaction);
            return;
        }

        // Slash commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                warn(`Slash command not found: ${interaction.commandName}`);
                return;
            }

            await command.execute(interaction, []);
            return;
        }

    } catch (err) {
        _error(`Error processing interaction: ${err}`);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
                content: 'There was an error processing this interaction.',
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content: 'There was an error processing this interaction.',
                ephemeral: true,
            });
        }
    }
}