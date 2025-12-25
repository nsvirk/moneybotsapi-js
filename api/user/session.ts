/**
 * Main Session management combining OMS and API sessions
 */

import { generateOMSSession } from "./sessionOMS";
import { generateAPISession } from "./sessionAPI";

/**
 * Generate complete session (OMS + API)
 * @param userId - Zerodha user ID
 * @param password - User password
 * @param totpSecret - TOTP secret
 * @param apiKey - Zerodha API Key (optional)
 * @param apiSecret - Zerodha API Secret (optional)
 * @returns Session data based on provided parameters
 */
export async function generateSession(
  userId: string,
  password: string,
  totpSecret: string,
  apiKey?: string,
  apiSecret?: string
) {
  // If api_key and api_secret are provided, generate full API session
  if (apiKey && apiSecret) {
    return await generateAPISession(
      userId,
      password,
      totpSecret,
      apiKey,
      apiSecret
    );
  }

  // Otherwise, only generate OMS session
  return await generateOMSSession(userId, password, totpSecret);
}
