/**
 * Handle user registration
 */
import { db } from "../_db/kite_users";
import { successResponse, inputError, dbError } from "../_shared/responses";
import { getISTTimestamp } from "../_shared/time";

export async function handleRegister(req: Request): Promise<Response> {
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

    // Hash password using Bun's built-in bcrypt implementation
    const password_hash = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10, // bcrypt cost factor (10 is default, good balance)
    });

    // Generate hash_key (random UUID)
    const hash_key = crypto.randomUUID();

    // Get current timestamp
    const timestamp = getISTTimestamp();

    // Check if user already exists
    const existingUser = db
      .prepare("SELECT id FROM kite_users WHERE user_id = ?")
      .get(user_id) as { id: number } | undefined;

    let operation: "created" | "updated";

    try {
      if (existingUser) {
        // Update existing user
        db.prepare(
          `UPDATE kite_users
           SET password_hash = ?, totp_secret = ?, hash_key = ?, updated_at = ?
           WHERE user_id = ?`
        ).run(password_hash, totp_secret, hash_key, timestamp, user_id);
        operation = "updated";
      } else {
        // Insert new user
        db.prepare(
          `INSERT INTO kite_users (user_id, password_hash, totp_secret, hash_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          user_id,
          password_hash,
          totp_secret,
          hash_key,
          timestamp,
          timestamp
        );
        operation = "created";
      }
    } catch (error) {
      console.error("Database error:", error);
      return dbError(
        error instanceof Error ? error.message : "Database operation failed"
      );
    }

    const message =
      operation === "updated"
        ? "User updated successfully"
        : "User registered successfully";

    return successResponse({
      message,
      user_id,
      operation,
    });
  } catch (error) {
    console.error("Error:", error);
    return dbError(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
