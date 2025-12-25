/**
 * Handle user logout
 */
import { db } from "../_db/kite_users";
import {
  successResponse,
  inputError,
  authError,
  dbError,
} from "../_shared/responses";

export async function handleLogout(req: Request): Promise<Response> {
  try {
    // Only allow DELETE requests
    if (req.method !== "DELETE") {
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

    // Validate required fields
    if (!user_id) {
      return inputError("user_id is required");
    }

    // Get the latest session for this user
    let sessionRecord;
    try {
      sessionRecord = db
        .prepare(
          "SELECT api_key, access_token FROM kite_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(user_id) as
        | { api_key: string | null; access_token: string | null }
        | undefined;
    } catch (error) {
      console.error("Database error:", error);
      return dbError(
        error instanceof Error ? error.message : "Database query failed"
      );
    }

    // If no session found, return error
    if (!sessionRecord) {
      return authError("No active session found for this user");
    }

    // If API session exists, invalidate it on Kite API
    if (sessionRecord.api_key && sessionRecord.access_token) {
      try {
        const deleteUrl = `https://api.kite.trade/session/token?api_key=${sessionRecord.api_key}&access_token=${sessionRecord.access_token}`;

        const response = await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            "X-Kite-Version": "3",
          },
        });

        if (response.ok) {
          console.log("API session invalidated successfully on Kite API");
        } else {
          const errorData = await response.text();
          console.warn(
            `Failed to invalidate API session on Kite API [${response.status}]:`,
            errorData
          );
          // Continue with local deletion even if API call fails
        }
      } catch (error) {
        console.error("Error invalidating API session on Kite API:", error);
        // Continue with local deletion even if API call fails
      }
    }

    // Delete session from database
    try {
      const result = db
        .prepare("DELETE FROM kite_sessions WHERE user_id = ?")
        .run(user_id);

      if (result.changes === 0) {
        return authError("No session found to delete");
      }

      console.log(`Deleted ${result.changes} session(s) for user: ${user_id}`);
    } catch (error) {
      console.error("Failed to delete session from database:", error);
      return dbError(
        error instanceof Error ? error.message : "Failed to delete session"
      );
    }

    // Return success response
    return successResponse({
      message: "Logout successful",
      user_id: user_id,
    });
  } catch (error) {
    console.error("Error:", error);
    return dbError(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
