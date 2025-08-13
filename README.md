# Clerk Discord Bot

Clerk is a Discord bot designed for Old School RuneScape (OSRS) clan communities, with deep integration to the [Wise Old Man (WOM)](https://wiseoldman.net/) API. It automates clan management, tracks promotions, manages competitions, and provides a suite of utilities for Discord servers.

---

## Features

### 🏆 Wise Old Man Integration

- **Automatic Rank Assignment:**  
  When a user joins the server, Clerk fetches their WOM group rank and assigns the corresponding Discord role.
- **Promotion Tracking:**  
  Automatically logs and displays member promotions, including before/after ranks and timestamps.
- **Name Change Tracking:**  
  Detects and displays RuneScape name changes for members, with full history lookup.
- **Competition Management:**  
  Create, link, and manage WOM competitions directly from Discord. Users can join/leave by reacting to messages.
- **Online Players Display:**  
  Shows a live-updating list of online clan members in a dedicated channel/message, with rank emojis.

### 🛠️ Server Management

- **Channel Configuration:**  
  Set up dedicated channels for announcements, event planning, promotion logs, join/leave logs, name changes, clan coffer, and online members.
- **Role & Emoji Creation:**  
  Create Discord roles and custom emojis for clan ranks, using provided rank images.
- **Welcome Messages:**  
  Set custom welcome messages for new members.

### 👥 Team Utilities

- **Divide Teams:**  
  Randomly split server members into balanced teams for events or competitions.

### 🔗 Webhook Support

- **Express Webhook Server:**  
  Accepts webhooks for updating online players, linking clans, and creating roles from external sources.

### 📝 Logging

- **Discord Webhook Logging:**  
  All important actions and errors are logged to a configured Discord webhook for easy monitoring.

---

## Setup & Installation

### 1. Prerequisites

- Node.js v18+ recommended
- Discord bot token and application
- SQLite (database auto-created)

### 2. Installation

```sh
git clone https://github.com/yourusername/clerk-discord-bot.git
cd clerk-discord-bot
npm install
```

### 3. Configuration

Create a `.env` file in the project root. This file stores sensitive configuration options for your bot.

#### Example `.env` file

```env
# Discord bot token for bot login
BOT_TOKEN=

# Discord client ID for deploying slash commands
CLIENT_ID=

# Guild ID for guild-specific developer commands
GUILD_ID=

# Timezone for console logging (Supports ET, CT, MT, PT - or UTC if not provided)
TIMEZONE=

# Port for receiving data from the Clerk RuneLite plugin (defaults to 4000 if not provided)
PORT=

# Wise Old Man API key (optional, for better rates)
WOM_API_KEY=

# Discord webhook URL for logging (optional)
LOG_WEBHOOK_URL=
```