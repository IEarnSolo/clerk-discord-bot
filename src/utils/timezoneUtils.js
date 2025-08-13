// src/utils/timezoneUtils.js
import { DateTime } from 'luxon';

// Map common abbreviations to IANA timezone names
export const timezoneMap = {
  ET: 'America/New_York',
  CT: 'America/Chicago',
  MT: 'America/Denver',
  PT: 'America/Los_Angeles',
  UTC: 'UTC' // Added for default handling
};

/**
 * Parse a date and time string into a Luxon DateTime object.
 */
export function parseDate(dateStr, timeStr, timezoneAbbr = 'ET') {
  const timezone = timezoneMap[timezoneAbbr.toUpperCase()];
  if (!timezone) return null;

  const dateTimeString = `${dateStr} ${timeStr}`;
  const dateTime = DateTime.fromFormat(dateTimeString, 'M/d/yyyy h:mma', { zone: timezone });

  return dateTime.isValid ? dateTime : null;
}

/**
 * Get a Luxon DateTime for "now" in the given timezone abbreviation.
 */
export function getNowInTimezone(timezoneAbbr = 'UTC') {
  const zone = timezoneMap[timezoneAbbr.toUpperCase()] || 'UTC';
  return DateTime.now().setZone(zone);
}
