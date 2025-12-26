/**
 * Refresh instruments data from the Kite API
 */
import { db } from "../_db/kite_instruments";
import {
  successResponse,
  dbError,
  internalError,
  checkMethod,
} from "../_shared/responses";
import { getISTTimestamp } from "../_shared/time";

/**
 * CSV parser for instruments data
 */
function parseCSV(csvText: string): Array<Record<string, string>> {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("Invalid CSV format: no data rows");
  }

  const headers = lines[0]?.split(",") || [];
  const data: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(",") || [];
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = values[j];
      if (header !== undefined) {
        // Remove quotes from values
        row[header] = value?.replace(/^"|"$/g, "") || "";
      }
    }

    data.push(row);
  }

  return data;
}

/**
 * Transform CSV row to database record
 */
function transformToDBRecord(row: Record<string, string>, updatedAt: string) {
  return {
    instrument_token: parseInt(row.instrument_token || "0") || 0,
    exchange_token: parseInt(row.exchange_token || "0") || 0,
    tradingsymbol: row.tradingsymbol || "",
    name: row.name || null,
    last_price: parseFloat(row.last_price || "0") || 0,
    expiry:
      row.expiry && row.expiry !== "" && row.expiry !== "0" ? row.expiry : null,
    strike: parseFloat(row.strike || "0") || 0,
    tick_size: parseFloat(row.tick_size || "0") || 0,
    lot_size: parseInt(row.lot_size || "0") || 0,
    instrument_type: row.instrument_type || null,
    segment: row.segment || null,
    exchange: row.exchange || "",
    updated_at: updatedAt,
  };
}

/**
 * Core refresh logic - fetches and updates instruments data
 * Can be called internally or via HTTP endpoint
 */
export async function performInstrumentsRefresh(): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    console.log("Fetching instruments data from Kite API...");

    // Fetch CSV data from Kite API
    const response = await fetch("https://api.kite.trade/instruments");

    if (!response.ok) {
      console.error("Failed to fetch instruments:", response.statusText);
      return {
        success: false,
        count: 0,
        error: `Failed to fetch instruments: ${response.statusText}`,
      };
    }

    const csvText = await response.text();
    console.log("CSV data fetched successfully, parsing...");

    // Parse CSV
    const csvData = parseCSV(csvText);
    console.log(`Parsed ${csvData.length} instruments`);

    // Get IST timestamp for all records
    const istTimestamp = getISTTimestamp();
    console.log(`Using IST timestamp: ${istTimestamp}`);

    // Transform data for database
    const dbRecords = csvData.map((row) =>
      transformToDBRecord(row, istTimestamp)
    );

    // Truncate table
    console.log("Truncating kite_instruments table...");
    try {
      db.run("DELETE FROM kite_instruments");
      console.log("Table truncated, inserting new data...");
    } catch (error) {
      console.error("Error truncating table:", error);
      return {
        success: false,
        count: 0,
        error: `Failed to truncate table: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }

    // Insert data using prepared statement for better performance
    const insertStmt = db.prepare(`
      INSERT INTO kite_instruments (
        instrument_token, exchange_token, tradingsymbol, name, last_price,
        expiry, strike, tick_size, lot_size, instrument_type, segment,
        exchange, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;

    try {
      // Use a transaction for better performance
      db.run("BEGIN TRANSACTION");

      for (const record of dbRecords) {
        insertStmt.run(
          record.instrument_token,
          record.exchange_token,
          record.tradingsymbol,
          record.name,
          record.last_price,
          record.expiry,
          record.strike,
          record.tick_size,
          record.lot_size,
          record.instrument_type,
          record.segment,
          record.exchange,
          record.updated_at
        );
        insertedCount++;

        // Log progress every 10000 records
        if (insertedCount % 10000 === 0) {
          console.log(
            `Inserted ${insertedCount} / ${dbRecords.length} instruments`
          );
        }
      }

      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      console.error("Error inserting data:", error);
      return {
        success: false,
        count: 0,
        error: `Failed to insert data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }

    console.log(`Successfully refreshed ${insertedCount} instruments`);

    return {
      success: true,
      count: insertedCount,
    };
  } catch (error) {
    console.error("Error in performInstrumentsRefresh:", error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * HTTP handler for manual refresh endpoint
 */
export async function handleRefresh(req: Request): Promise<Response> {
  try {
    // Check HTTP method
    const methodError = checkMethod(req, "GET");
    if (methodError) return methodError;

    // Perform the refresh
    const result = await performInstrumentsRefresh();

    // Return appropriate response
    if (result.success) {
      return successResponse({
        message: "Instruments refreshed successfully",
        total_instruments: result.count,
      });
    } else {
      return dbError(result.error || "Refresh failed");
    }
  } catch (error) {
    console.error("Error in refresh handler:", error);
    return internalError(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
