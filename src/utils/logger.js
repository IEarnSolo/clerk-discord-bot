import dotenv from 'dotenv';
import { getNowInTimezone } from './timezoneUtils.js';

dotenv.config();

const envTz = process.env.TIMEZONE?.toUpperCase() || 'UTC';
const webhookUrl = process.env.LOG_WEBHOOK_URL;

const DISCORD_MAX_LENGTH = 2000;
const BATCH_DELAY = 1000; // 1 second

let logBuffer = [];
let batchTimer = null;

/**
 * Formats the current timestamp in the configured timezone.
 * @returns {string} Formatted timestamp string in the configured timezone.
 */
function formatTimestamp() {
  return getNowInTimezone(envTz)
    .toFormat(`MM-dd-yyyy hh:mm:ss a '${envTz}'`);
}

/**
 * Adds a log message to the buffer and schedules a flush.
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} msg - Log message
 */
function addToBuffer(level, msg) {
  const formatted = `[${formatTimestamp()}] [${level}] ${msg}`;
  logBuffer.push(formatted);

  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(flushBuffer, BATCH_DELAY);
}

/**
 * Flushes the log buffer by sending its contents to Discord in chunks.
 */
async function flushBuffer() {
  if (logBuffer.length === 0) return;

  const combinedLogs = logBuffer.join('\n');
  logBuffer = [];

  const chunks = splitIntoChunks(combinedLogs, DISCORD_MAX_LENGTH);

  for (const chunk of chunks) {
    await sendToDiscord(chunk);
  }
}

/** Splits a text into chunks not exceeding maxLength.
 * @param {string} text - The text to split
 * @param {number} maxLength - Maximum length of each chunk
 * @returns {string[]} - Array of text chunks
 */
function splitIntoChunks(text, maxLength) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    chunks.push('```' + text.slice(start, start + maxLength - 6) + '```');
    start += maxLength - 6;
  }

  return chunks;
}

/**
 * Sends a log message to the Discord webhook.
 * @param {string} content - The log message content
 */
async function sendToDiscord(content) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error(`[${formatTimestamp()}] [ERROR] Failed to send log to Discord: ${err.message}`);
  }
}

/**
 * Logs an informational message.
 * @param {string} msg - The message to log
 */
export function info(msg) {
  console.log(`[${formatTimestamp()}] [INFO] ${msg}`);
  addToBuffer('INFO', msg);
}

/**
 * Logs a warning message.
 * @param {string} msg - The message to log
 */
export function warn(msg) {
  console.warn(`[${formatTimestamp()}] [WARN] ${msg}`);
  addToBuffer('WARN', msg);
}

/**
 * Logs an error message.
 * @param {string} msg - The message to log
 */
export function error(msg) {
  console.error(`[${formatTimestamp()}] [ERROR] ${msg}`);
  addToBuffer('ERROR', msg);
}