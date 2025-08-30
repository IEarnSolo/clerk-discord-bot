// src/services/databaseService.js
// Centralized SQLite service for Clerk Discord Bot.
// Handles DB connection, schema creation, and query helpers.

import sqlite3pkg from 'sqlite3';
import { resolve as _resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { info, error } from '../utils/logger.js';

// Enable verbose mode
const sqlite3 = sqlite3pkg.verbose();

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to DB file (auto-created if missing)
const dbPath = _resolve(__dirname, '../../database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    error(`Error connecting to SQLite database: ${err.message}`);
  } else {
    info(`Connected to SQLite database at ${dbPath}`);
  }
});

// Create all tables if they don't exist
db.serialize(() => {
  // ===============================
  // Promotions table
  // ===============================
  db.run(`CREATE TABLE IF NOT EXISTS promotions (
    guild_id TEXT,  
    rsn TEXT,
    date TEXT,
    timestamp INTEGER,
    beforeRank TEXT,
    afterRank TEXT,
    UNIQUE(guild_id, rsn, date, timestamp)
  )`);

  // ===============================
  // Name change tracking tables
  // ===============================
  db.run(`
    CREATE TABLE IF NOT EXISTS name_change_keys (
      original_name TEXT PRIMARY KEY,
      current_name TEXT NOT NULL,
      joined_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS name_changes (
      original_name TEXT NOT NULL,
      old_name TEXT NOT NULL,
      new_name TEXT NOT NULL,
      change_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (original_name) REFERENCES name_change_keys(original_name)
    )
  `);

  // ===============================
  // Competitions table
  // ===============================
  db.run(`
    CREATE TABLE IF NOT EXISTS competitions (
      guild_id TEXT,
      competitionId INTEGER,
      type TEXT,
      title TEXT,
      metric TEXT,
      verificationCode TEXT,
      startsAt INTEGER,
      endsAt INTEGER,
      messageLink TEXT,
      emoji TEXT,
      status INTEGER,
      starting_hour TEXT,
      poll_message_id TEXT,
      tiebreaker_poll_message_id TEXT
    )
  `);

  // ===============================
// Competition settings table
// ===============================
db.run(`
  CREATE TABLE IF NOT EXISTS competition_settings (
    guild_id TEXT PRIMARY KEY,
    clan_events_role_id TEXT,
    skill_blacklist TEXT,
    boss_blacklist TEXT,
    last_chosen_metric TEXT,
    tiebreaker_poll_duration INTEGER DEFAULT 3,
    days_after_poll INTEGER DEFAULT 7
  )
`);

  // ===============================
  // Message configuration table
  // ===============================
  db.run(`
    CREATE TABLE IF NOT EXISTS message_config (
      guild_id TEXT PRIMARY KEY,
      online_members_message_id TEXT
    )
  `);

  // ===============================
  // Clan-to-guild linking table
  // ===============================
  db.run(`
    CREATE TABLE IF NOT EXISTS clan_guild_links (
      guild_id TEXT PRIMARY KEY,
      clan_name TEXT,
      wom_group_id TEXT,
      verification_code TEXT
    )
  `);

  // ===============================
  // Bot permissions table
  // ===============================
  db.run(`
    CREATE TABLE IF NOT EXISTS bot_permissions (
      guild_id TEXT PRIMARY KEY,
      role_id TEXT
    )
  `);

  // ===============================
  // Channel settings table
  // ===============================
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_settings (
      guild_id TEXT PRIMARY KEY,
      announcements_channel_id TEXT,
      event_planning_channel_id TEXT,
      promotion_logs_channel_id TEXT,
      join_leave_logs_channel_id TEXT,
      name_changes_channel_id TEXT,
      clan_coffer_channel_id TEXT,
      online_members_channel_id TEXT
    )
  `);

    // ===============================
  // Welcome message table
  // ===============================
  db.run(`
    CREATE TABLE IF NOT EXISTS welcome_messages (
      guildId TEXT PRIMARY KEY,
      message TEXT
    )
  `);

  info('All database tables ensured.');
});

// ======================================
// Helper functions for running queries
// ======================================

/**
 * Get the raw database object for advanced queries.
 * @returns {sqlite3.Database} - The SQLite database instance
 */
export function getDB() {
  return db;
}

/**
 * Execute a SQL query that modifies data (INSERT, UPDATE, DELETE).
 * @param {string} query - The SQL query string
 * @param {Array} params - The parameters for the SQL query
 * @returns {Promise<sqlite3.RunResult>} - The result of the run operation
 */
export function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        error(`DB Run Error: ${err.message}`);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

/**
 * Execute a SQL query that retrieves multiple rows.
 * @param {string} query - The SQL query string
 * @param {Array} params - The parameters for the SQL query
 * @returns {Promise<Array>} - The resulting rows from the query
 */
export function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        error(`DB All Error: ${err.message}`);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Execute a SQL query that retrieves a single row.
 * @param {string} query - The SQL query string
 * @param {Array} params - The parameters for the SQL query
 * @returns {Promise<Object|null>} - The resulting row or null if not found
 */
export function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        error(`DB Get Error: ${err.message}`);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}
