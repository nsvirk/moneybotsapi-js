/**
 * Kite Users Database Schema
 */
import { db } from "./db";

/**
 * Initialize kite_users and kite_sessions table schemas
 */
function initializeUsersSchema() {
  // Create kite_users table
  db.run(`
    CREATE TABLE IF NOT EXISTS kite_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      totp_secret TEXT NOT NULL,
      hash_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create kite_sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS kite_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      enctoken TEXT,
      api_key TEXT,
      access_token TEXT,
      kite_session TEXT NOT NULL,
      login_type TEXT NOT NULL,
      login_time TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES kite_users(user_id)
    )
  `);

  // Index for user lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_user_id
    ON kite_users(user_id)
  `);

  // Index for session lookups
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_session_user_id
    ON kite_sessions(user_id)
  `);

  console.log("Kite users and sessions schema initialized");
}

// Initialize schema on module load
initializeUsersSchema();

// Re-export db for convenience
export { db };
