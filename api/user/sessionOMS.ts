/**
 * OMS Session management for Zerodha Kite API
 */

import { generateTotpValue } from "./totp";
import { getISTTimestamp } from "../_shared/time";

/**
 * Kite API Login Response structure
 */
interface KiteLoginResponse {
  status: string;
  data: {
    user_id: string;
    request_id: string;
    twofa_type: string;
    twofa_types: string[];
    twofa_status: string;
    profile: {
      user_name: string;
      user_shortname: string;
      avatar_url: string | null;
    };
  };
}

/**
 * Kite API TwoFA Response structure
 */
interface KiteTwoFAResponse {
  status: string;
  data: {
    profile: Record<string, any>;
  };
}

/**
 * OMS Session Result
 */
export interface OMSSessionResult {
  success: boolean;
  user_id?: string;
  enctoken?: string;
  kf_session?: string;
  public_token?: string;
  login_time?: string;
  raw_cookies?: string;
  error?: string;
}

/**
 * Generate OMS Session using Zerodha Kite API
 * @param userId - Zerodha user ID
 * @param password - User password
 * @param totpSecret - TOTP secret for 2FA
 * @returns OMS Session result
 */
export async function generateOMSSession(
  userId: string,
  password: string,
  totpSecret: string
): Promise<OMSSessionResult> {
  try {
    // Step 1a: kiteAPILoginRequest
    const loginFormData = new URLSearchParams();
    loginFormData.append("user_id", userId);
    loginFormData.append("password", password);

    const loginResponse = await fetch("https://kite.zerodha.com/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: loginFormData.toString(),
    });

    // Step 1b: kiteAPILoginResponse
    if (!loginResponse.ok) {
      const errorData = await loginResponse.text();
      return {
        success: false,
        error: `Login failed [${loginResponse.status}]: ${errorData}`,
      };
    }

    // Extract cookies from login response (includes kf_session!)
    const loginCookies = loginResponse.headers.get("set-cookie") || "";

    const loginData = (await loginResponse.json()) as KiteLoginResponse;

    if (loginData.status !== "success") {
      return {
        success: false,
        error: JSON.stringify(loginData),
      };
    }

    const { user_id, request_id, twofa_type } = loginData.data;

    // Step 2a: kiteAPITwoFARequest
    // Generate TOTP value
    const twofaValue = await generateTotpValue(totpSecret);

    const twofaFormData = new URLSearchParams();
    twofaFormData.append("user_id", user_id);
    twofaFormData.append("request_id", request_id);
    twofaFormData.append("twofa_value", twofaValue);
    twofaFormData.append("twofa_type", twofa_type);

    // Convert login cookies to Cookie header format for 2FA request
    const convertSetCookieToCookie = (setCookie: string): string => {
      const cookies = setCookie.split(/,(?=\s*\w+=)/).map((cookie) => {
        const nameValue = cookie.split(";")[0].trim();
        return nameValue;
      });
      return cookies.join("; ");
    };

    const loginCookieHeader = convertSetCookieToCookie(loginCookies);

    const twofaResponse = await fetch("https://kite.zerodha.com/api/twofa", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: loginCookieHeader,
      },
      body: twofaFormData.toString(),
    });

    // Step 2b: kiteAPITwoFAResponse
    if (!twofaResponse.ok) {
      const errorData = await twofaResponse.text();
      return {
        success: false,
        error: `2FA failed [${twofaResponse.status}]: ${errorData}`,
      };
    }

    const twofaData = (await twofaResponse.json()) as KiteTwoFAResponse;

    if (twofaData.status !== "success") {
      return {
        success: false,
        error: JSON.stringify(twofaData),
      };
    }

    // Extract ALL cookies from 2FA response
    const twofaCookies = twofaResponse.headers.get("set-cookie") || "";

    // Combine cookies from both login and 2FA responses
    const allCookies = [loginCookies, twofaCookies].filter(Boolean).join(", ");

    // Parse individual cookie values for return data
    const parseCookie = (
      cookieString: string,
      name: string
    ): string | undefined => {
      const regex = new RegExp(`${name}=([^;]+)`);
      const match = cookieString.match(regex);
      return match ? match[1] : undefined;
    };

    // Parse from login cookies (kf_session is here)
    const kf_session = parseCookie(loginCookies, "kf_session");

    // Parse from 2FA cookies
    const enctoken = parseCookie(twofaCookies, "enctoken");
    const public_token = parseCookie(twofaCookies, "public_token");

    // Store ALL cookies (from both responses) for API session use
    const rawCookies = allCookies;

    // Get current time in Asia/Kolkata timezone (IST: UTC+5:30)
    const login_time = getISTTimestamp();

    // Return success result with cookies
    return {
      success: true,
      user_id: user_id,
      enctoken,
      kf_session,
      public_token,
      login_time,
      raw_cookies: rawCookies,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Check if enctoken is still valid
 * @param enctoken - Encrypted token from OMS session
 * @returns Boolean indicating if enctoken is valid
 */
export async function isEnctokenValid(enctoken: string): Promise<boolean> {
  try {
    const url = "https://kite.zerodha.com/oms/user/profile";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `enctoken ${enctoken}`,
      },
    });

    // If status is 200, enctoken is valid
    return response.status === 200;
  } catch (error) {
    console.error("Error validating enctoken:", error);
    return false;
  }
}

/**
 * Get User Profile
 * @param enctoken - Encrypted token from OMS session
 * @returns User profile data
 */
export async function getUserProfile(enctoken: string): Promise<any> {
  try {
    const url = "https://kite.zerodha.com/oms/user/profile";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `enctoken ${enctoken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        `Failed to get user profile [${response.status}]:`,
        errorData
      );
      return null;
    }

    const profileData = await response.json();
    return profileData.data;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
}
