/**
 * Shared SQLite Database Instance
 */
import { Database } from "bun:sqlite";

/**
 * In-memory SQLite database instance
 * Shared across all tables
 */
export const db = new Database(":memory:");

console.log("Database instance created");
