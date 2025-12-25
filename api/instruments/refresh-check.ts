/**
 * Check if instruments data needs to be refreshed
 */
import { db } from "../_db/kite_instruments";
import { getISTTimestamp } from "../_shared/time";

/**
 * Calculate the instruments refresh cutoff time (8:30am IST) for data freshness check
 * Kite API refreshes instruments data by 8:15am daily, we use 8:30am as cutoff
 * - If current time is before 8:30am: returns yesterday's 8:30am
 * - If current time is at or after 8:30am: returns today's 8:30am
 */
function getInstrumentsRefreshCutoff(): string {
  const currentIST = getISTTimestamp();

  // Parse current IST time
  const parts = currentIST.split(" ");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid timestamp format");
  }

  const datePart = parts[0];
  const timePart = parts[1];

  const dateParts = datePart.split("-").map(Number);
  const timeParts = timePart.split(":").map(Number);

  if (dateParts.length !== 3 || timeParts.length < 2) {
    throw new Error("Invalid timestamp format");
  }

  const year = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 0;
  const day = dateParts[2] ?? 0;
  const hours = timeParts[0] ?? 0;
  const minutes = timeParts[1] ?? 0;

  // Instruments data refreshes by 8:15am, we check at 8:30am to be safe
  const REFRESH_CUTOFF_HOUR = 8;
  const REFRESH_CUTOFF_MINUTE = 30;

  // Determine which day's 8:30am to use as cutoff
  let cutoffDate = new Date(year, month - 1, day);

  // If current time is before 8:30am, use previous day's 8:30am
  if (hours < REFRESH_CUTOFF_HOUR || (hours === REFRESH_CUTOFF_HOUR && minutes < REFRESH_CUTOFF_MINUTE)) {
    cutoffDate.setDate(cutoffDate.getDate() - 1);
  }

  // Format cutoff as YYYY-MM-DD 08:30:00
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = String(cutoffDate.getMonth() + 1).padStart(2, "0");
  const cutoffDay = String(cutoffDate.getDate()).padStart(2, "0");

  return `${cutoffYear}-${cutoffMonth}-${cutoffDay} 08:30:00`;
}

/**
 * Get the most recent update timestamp from the database
 * Returns null if no data exists or on error
 */
function getLatestUpdateTime(): string | null {
  try {
    const result = db
      .prepare("SELECT MAX(updated_at) as latest FROM kite_instruments")
      .get() as { latest: string | null };

    return result?.latest || null;
  } catch (error) {
    console.error("Error querying latest update time:", error);
    return null;
  }
}

/**
 * Determine if instruments data needs to be refreshed
 * Returns true if data is stale (needs refresh), false if data is fresh
 *
 * Logic:
 * - Before 8:30am: data must be updated after previous day's 8:30am
 * - After 8:30am: data must be updated after today's 8:30am
 * - No data in DB: returns true (refresh needed)
 * - Database error: returns true (safer to refresh)
 */
export function isRefreshRequired(): boolean {
  try {
    // Get the instruments refresh cutoff time (8:30am for current trading day)
    const cutoff = getInstrumentsRefreshCutoff();

    // Get the most recent update time from database
    const latestUpdate = getLatestUpdateTime();

    // If no data exists, refresh is required
    if (!latestUpdate) {
      console.log("No data in database, refresh required");
      return true;
    }

    // Compare timestamps (string comparison works due to YYYY-MM-DD HH:mm:ss format)
    // If last update is before cutoff, refresh is required
    if (latestUpdate < cutoff) {
      console.log(
        `Data is stale. Last update: ${latestUpdate}, Refresh cutoff: ${cutoff}`
      );
      return true;
    }

    // Data is fresh
    console.log(
      `Data is fresh. Last update: ${latestUpdate}, Refresh cutoff: ${cutoff}`
    );
    return false;
  } catch (error) {
    console.error("Error in isRefreshRequired:", error);
    // On error, safer to refresh
    return true;
  }
}
