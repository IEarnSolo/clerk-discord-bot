// womClient.js
// Centralized Wise Old Man API client

import 'dotenv/config';
import { WOMClient, Metric } from '@wise-old-man/utils';

// Initialize WOM client with API key from environment variables
export const womClient = new WOMClient({
  apiKey: process.env.WISE_OLD_MAN_API_KEY, // Set this in your .env
  // userAgent: 'iearnsolo' // Optional: Identify your bot
});

// Export Metric enum too, so commands/services can import from here
export { Metric };