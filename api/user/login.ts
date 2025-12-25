/**
 * Handle user login
 */
import { db } from "../_db/kite_users";
import {
  successResponse,
  inputError,
  authError,
  dbError,
} from "../_shared/responses";
import { getISTTimestamp } from "../_shared/time";
import { generateSession } from "./session";
import { getUserProfile, isEnctokenValid } from "./sessionOMS";

export async function handleLogin(req: Request): Promise<Response> {
  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      return inputError("Method not allowed");
    }

    // Parse form-encoded data
    const contentType = req.headers.get("content-type");
    if (!contentType?.includes("application/x-www-form-urlencoded")) {
      return inputError(
        "Content-Type must be application/x-www-form-urlencoded"
      );
    }

    const formData = await req.formData();
    const user_id = formData.get("user_id")?.toString();
    const password = formData.get("password")?.toString();
    const totp_secret = formData.get("totp_secret")?.toString();
    const api_key = formData.get("api_key")?.toString();
    const api_secret = formData.get("api_secret")?.toString();

    // Validate required fields
    if (!user_id) {
      return inputError("user_id is required");
    }
    if (!password) {
      return inputError("password is required");
    }
    if (!totp_secret) {
      return inputError("totp_secret is required");
    }

    // Verify user credentials
    let userRecord;
    try {
      userRecord = db
        .prepare(
          "SELECT password_hash, totp_secret FROM kite_users WHERE user_id = ?"
        )
        .get(user_id) as
        | { password_hash: string; totp_secret: string }
        | undefined;
    } catch (error) {
      console.error("Database error:", error);
      return dbError(
        error instanceof Error ? error.message : "Database query failed"
      );
    }

    if (!userRecord) {
      return authError("Invalid credentials");
    }

    // Verify password using Bun's password.verify
    const isPasswordValid = await Bun.password.verify(
      password,
      userRecord.password_hash
    );

    if (!isPasswordValid) {
      return authError("Invalid credentials");
    }

    // Verify TOTP secret matches
    if (userRecord.totp_secret !== totp_secret) {
      return authError("Invalid credentials");
    }

    console.log("User credentials verified successfully");

    // Check if user has existing session data
    let existingSession;
    try {
      existingSession = db
        .prepare(
          "SELECT enctoken, kite_session FROM kite_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(user_id) as
        | { enctoken: string | null; kite_session: string }
        | undefined;
    } catch (error) {
      console.error("Error fetching existing session:", error);
    }

    // If existing session data exists, validate enctoken before returning
    if (existingSession?.kite_session && existingSession?.enctoken) {
      console.log(
        "Found existing session, validating enctoken for user:",
        user_id
      );

      const isValid = await isEnctokenValid(existingSession.enctoken);

      if (isValid) {
        console.log("Enctoken is valid, returning cached session");
        const sessionData = JSON.parse(existingSession.kite_session);
        return successResponse(sessionData);
      } else {
        console.log("Enctoken is invalid or expired, generating new session");
      }
    } else {
      console.log("No existing session found, generating new session");
    }

    // Generate session (OMS or API based on provided parameters)
    const sessionResult = await generateSession(
      user_id,
      password,
      totp_secret,
      api_key,
      api_secret
    );

    if (!sessionResult.success) {
      return authError(sessionResult.error || "Failed to generate session");
    }

    // Type guard to check if it's an API session result
    if ("api_session" in sessionResult && sessionResult.api_session) {
      const apiSession = sessionResult.api_session;

      // Save API session to database
      const timestamp = getISTTimestamp();

      try {
        db.prepare(
          `INSERT INTO kite_sessions (user_id, enctoken, api_key, access_token, kite_session, login_type, login_time, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          apiSession.user_id,
          ("oms_session" in sessionResult && sessionResult.oms_session?.enctoken) || null,
          apiSession.api_key,
          apiSession.access_token,
          JSON.stringify(apiSession),
          "API",
          new Date().toISOString(),
          timestamp,
          timestamp
        );
        console.log("API session saved successfully");
      } catch (error) {
        console.error("Failed to save API session to database:", error);
      }

      return successResponse(apiSession);
    }

    console.log("Generating OMS session");

    // Type assertion for OMS session result
    const omsSession = sessionResult as {
      success: boolean;
      user_id?: string;
      enctoken?: string;
      kf_session?: string;
      public_token?: string;
      login_time?: string;
    };

    // Otherwise, get user profile and merge with OMS session data
    const profile = await getUserProfile(omsSession.enctoken!);

    if (!profile) {
      return authError("Failed to get user profile");
    }

    // Prepare OMS response data
    const omsResponse = {
      user_id: omsSession.user_id,
      user_type: profile.user_type,
      email: profile.email,
      user_name: profile.user_name,
      user_shortname: profile.user_shortname,
      broker: profile.broker,
      exchanges: profile.exchanges,
      products: profile.products,
      order_types: profile.order_types,
      avatar_url: profile.avatar_url,
      enctoken: omsSession.enctoken,
      kf_session: omsSession.kf_session,
      public_token: omsSession.public_token,
      login_time: omsSession.login_time,
      meta: profile.meta,
    };

    // Save OMS session to database
    const timestamp = getISTTimestamp();

    try {
      db.prepare(
        `INSERT INTO kite_sessions (user_id, enctoken, api_key, access_token, kite_session, login_type, login_time, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        omsSession.user_id || user_id,
        omsSession.enctoken || null,
        null,
        null,
        JSON.stringify(omsResponse),
        "OMS",
        new Date(omsSession.login_time || new Date().toISOString()).toISOString(),
        timestamp,
        timestamp
      );
      console.log("OMS session saved successfully");
    } catch (error) {
      console.error("Failed to save OMS session to database:", error);
    }

    // Return merged profile and OMS session data
    return successResponse(omsResponse);
  } catch (error) {
    console.error("Error:", error);
    return dbError(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
