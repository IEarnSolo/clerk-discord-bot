// Central configuration file for your bot.
// All constants, IDs, emojis, URLs, and default settings live here.
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RANK_IMAGES_FOLDER = path.join(__dirname, 'assets', 'rankimages');
export const BOT_PREFIXES = ['!', '/', '::'];
export const DEFAULT_PORT = 4000;
export const GUILD_ID = 'YOUR_GUILD_ID';
export const WOM_BOT_ID = '719720369241718837';
export const WOM_API_BASE_URL = 'https://api.wiseoldman.net/v2/groups';
export const WOM_API_BASE_URL_PLAYERS = 'https://api.wiseoldman.net/v2/players';
export const WOM_COMPETITION_BASE_URL = 'https://wiseoldman.net/competitions/';
export const TEAM_EMOJI = '✅';
export const MAIN_COLOR = 0x4860ff; // Blue for embeds
export const ERROR_COLOR = 0xE74C3C; // Red for error embeds
