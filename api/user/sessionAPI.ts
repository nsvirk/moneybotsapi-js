/**
 * API Session management for Zerodha Kite API
 */

import { generateOMSSession } from "./sessionOMS";

/**
 * Generate API Session
 * @param userId - Zerodha user ID
 * @param password - User password
 * @param totpSecret - TOTP secret
 * @param apiKey - Zerodha API Key
 * @param apiSecret - Zerodha API Secret
 * @returns API Session data
 */
export async function generateAPISession(
  userId: string,
  password: string,
  totpSecret: string,
  apiKey: string,
  apiSecret: string
) {
  try {
    // Step 1: Generate OMS Session first (to get cookies)
    const omsResult = await generateOMSSession(userId, password, totpSecret);
    if (!omsResult.success) {
      return {
        success: false,
        error: omsResult.error || "Failed to generate OMS session",
      };
    }

    // Convert Set-Cookie header to Cookie header format
    const cookies = omsResult.raw_cookies
      ? convertSetCookieToCookie(omsResult.raw_cookies)
      : "";

    // Step 2: Get Session ID (with OMS cookies) - matches Golang getSessID()
    const sessId = await getSessionID(apiKey, cookies);
    if (!sessId) {
      return { success: false, error: "Failed to get session ID" };
    }

    // Step 3: Get Request Token (with OMS cookies AND sess_id) - matches Golang getRequestToken()
    const requestToken = await getRequestToken(apiKey, sessId, cookies);
    if (!requestToken) {
      return { success: false, error: "Failed to get request token" };
    }

    // Step 4: Generate Checksum
    const checksum = await generateChecksum(apiKey, requestToken, apiSecret);

    // Step 5: Generate Session Token
    const sessionTokenData = await generateSessionToken(
      apiKey,
      requestToken,
      checksum
    );
    if (!sessionTokenData) {
      return { success: false, error: "Failed to generate session token" };
    }

    return {
      success: true,
      oms_session: omsResult,
      api_session: sessionTokenData,
    };
  } catch (error) {
    console.error("[generateAPISession] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Convert Set-Cookie header format to Cookie header format
 * @param setCookie - Set-Cookie header value
 * @returns Cookie header value
 */
function convertSetCookieToCookie(setCookie: string): string {
  // Parse Set-Cookie header and extract just name=value pairs
  const cookies = setCookie.split(/,(?=\s*\w+=)/).map((cookie) => {
    // Extract just the name=value part (before first semicolon)
    const nameValue = cookie.split(";")[0].trim();
    return nameValue;
  });
  return cookies.join("; ");
}

/**
 * Generate Checksum for API session
 * @param apiKey - Zerodha API Key
 * @param requestToken - Request token from previous step
 * @param apiSecret - Zerodha API Secret
 * @returns Checksum (SHA256 hex encoded)
 */
export async function generateChecksum(
  apiKey: string,
  requestToken: string,
  apiSecret: string
): Promise<string> {
  const data = apiKey + requestToken + apiSecret;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  // Generate SHA256 hash
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksum = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return checksum;
}

/**
 * Generate Session Token
 * @param apiKey - Zerodha API Key
 * @param requestToken - Request token
 * @param checksum - Checksum for verification
 * @returns Session token data or null
 */
export async function generateSessionToken(
  apiKey: string,
  requestToken: string,
  checksum: string
): Promise<any> {
  try {
    const formData = new URLSearchParams();
    formData.append("api_key", apiKey);
    formData.append("request_token", requestToken);
    formData.append("checksum", checksum);

    const response = await fetch("https://api.kite.trade/session/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (response.status !== 200) {
      const errorData = await response.text();
      console.error("Session token generation failed:", errorData);
      return null;
    }

    const jsonData = await response.json();
    return jsonData.data;
  } catch (error) {
    console.error("Error generating session token:", error);
    return null;
  }
}

/**
 * Get Session ID (with OMS cookies)
 * @param apiKey - Zerodha API Key
 * @param cookies - Cookies from OMS session (required!)
 * @returns Session ID from redirect URL
 */
export async function getSessionID(
  apiKey: string,
  cookies: string
): Promise<string | null> {
  try {
    const url = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;

    const headers: HeadersInit = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:94.0) Gecko/20100101 Firefox/94.0",
      "X-Kite-Version": "3",
      Cookie: cookies,
    };

    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "manual", // Don't follow redirects
    });

    // Expect 302 redirect
    if (response.status !== 302) {
      const errorBody = await response.text();
      console.error(
        `[getSessID] Expected 302, got ${response.status}. Response:`,
        errorBody
      );
      return null;
    }

    // Get Location header which contains the redirect URL with sess_id
    const location = response.headers.get("location");
    if (!location) {
      console.error("[getSessID] No location header found in response");
      return null;
    }

    // Parse URL to extract sess_id query parameter
    const redirectUrl = new URL(location, "https://kite.zerodha.com");
    const sessId = redirectUrl.searchParams.get("sess_id");

    if (!sessId) {
      console.error("[getSessID] No sess_id found in redirect URL");
      return null;
    }

    return sessId;
  } catch (error) {
    console.error("[getSessID] Error:", error);
    return null;
  }
}

/**
 * Get Request Token (with OMS cookies and sess_id)
 * @param apiKey - Zerodha API Key
 * @param sessId - Session ID from getSessID()
 * @param cookies - Cookies from OMS session (required!)
 * @returns Request Token from redirect URL
 */
export async function getRequestToken(
  apiKey: string,
  sessId: string,
  cookies: string
): Promise<string | null> {
  try {
    // Use /connect/finish endpoint (matches Golang implementation)
    const url = `https://kite.zerodha.com/connect/finish?v=3&api_key=${apiKey}&sess_id=${sessId}`;

    const headers: HeadersInit = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:94.0) Gecko/20100101 Firefox/94.0",
      "X-Kite-Version": "3",
      Cookie: cookies,
    };

    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "manual", // Don't follow redirects - we'll read the Location header
    });

    // Kite redirects to callback URL with request_token as query param
    // We expect a 302 redirect response
    if (response.status !== 302) {
      const errorBody = await response.text();
      console.error(
        `[getRequestToken] Expected 302 redirect, got ${response.status}. Response:`,
        errorBody
      );
      return null;
    }

    // Read the Location header to get the callback URL with request_token
    const location = response.headers.get("location");
    if (!location) {
      console.error(
        "[getRequestToken] No location header found in 302 response"
      );
      return null;
    }

    // Parse request_token from the Location URL
    const locationUrl = new URL(location);
    const requestToken = locationUrl.searchParams.get("request_token");

    if (!requestToken) {
      console.error(
        "[getRequestToken] No request_token found in redirect location:",
        location
      );
      return null;
    }

    return requestToken;
  } catch (error) {
    console.error("[getRequestToken] Error:", error);
    return null;
  }
}
