import fs from "fs";
import path from "path";
import {
  RANK_IMAGES_FOLDER,
  BOSS_IMAGES,
  SKILL_IMAGES,
  MAIN_COLOR
} from "../../config.js"; // adjust if stored elsewhere
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { fullError } from "../../utils/logger.js";

function normalizeEmojiName(filename) {
  return filename.toLowerCase().replace(/\s+/g, "_");
}

function getAllImageFiles() {
  const folders = [RANK_IMAGES_FOLDER, BOSS_IMAGES, SKILL_IMAGES];
  let files = [];

  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;

    const folderFiles = fs
      .readdirSync(folder)
      .filter((f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg"))
      .map((f) => ({
        filename: path.parse(f).name, // without extension
        fullPath: path.join(folder, f)
      }));

    files = files.concat(folderFiles);
  }
  return files;
}

export default {
  data: new SlashCommandBuilder()
    .setName("create-emoji")
    .setDescription("Create a new emoji in this server from your stored assets")
    .addStringOption((option) =>
      option
        .setName("emoji")
        .setDescription("The emoji to create")
        .setAutocomplete(true)
        .setRequired(true)
    ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true).value?.toLowerCase() || "";
        const files = getAllImageFiles();

        const matched = files.filter((f) =>
        f.filename.toLowerCase().includes(focused)
        );

        // Fetch application emojis so we’re not working with an empty cache
        let appEmojis;
        try {
        appEmojis = await interaction.client.application.emojis.fetch();
        } catch (err) {
        fullError("Failed to fetch application emojis:", err);
        appEmojis = new Map();
        }

        // Build choices
        const choices = matched.slice(0, 25).map((f) => {
        const emojiName = normalizeEmojiName(f.filename);
        const existingEmoji = appEmojis.find((e) => e.name === emojiName);

        return {
            name: existingEmoji
            //? `${f.filename}: ${existingEmoji.toString()}`
            ? `${f.filename}`
            : f.filename,
            value: f.filename // 👈 just the filename, not full path
        };
        });

        await interaction.respond(choices);
    },

async execute(interaction) {
    const chosenFilename = interaction.options.getString("emoji");
    const files = getAllImageFiles();

    const file = files.find(
        (f) => normalizeEmojiName(f.filename) === normalizeEmojiName(chosenFilename)
    );

    if (!file) {
        const embed = new EmbedBuilder()
            .setColor("Red")
            .setTitle("❌ Emoji Not Found")
            .setDescription("Could not find the file for that emoji.");
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const emojiName = normalizeEmojiName(file.filename);

    try {
        // 🔑 Refresh cache
        await interaction.guild.emojis.cache.clear(); 
        await interaction.guild.emojis.fetch();
        const existingEmoji = interaction.guild.emojis.cache.find(
            (e) => e.name === emojiName
        );

        if (existingEmoji) {
            const embed = new EmbedBuilder()
                .setColor("Yellow")
                .setTitle("⚠️ Emoji Already Exists")
                .setDescription(
                    `An emoji named **${emojiName}** already exists: ${existingEmoji.toString()}`
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Create new emoji
        const imageBuffer = fs.readFileSync(file.fullPath);
        const newEmoji = await interaction.guild.emojis.create({
            attachment: imageBuffer,
            name: emojiName,
        });

        const embed = new EmbedBuilder()
            .setColor(MAIN_COLOR)
            .setTitle("✅ Emoji Created")
            .setDescription(`Created emoji ${newEmoji.toString()} with name **${emojiName}**`)
            //.setThumbnail(`attachment://${file.filename}`);

        await interaction.reply({
            content: `${newEmoji.toString()}`,
            embeds: [embed],
            //files: [file.fullPath], // shows thumbnail in embed
        });
    } catch (err) {
        console.error(err);
        const embed = new EmbedBuilder()
            .setColor("Red")
            .setTitle("❌ Failed to Create Emoji")
            .setDescription("Make sure I have permission to manage emojis!");
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}


};