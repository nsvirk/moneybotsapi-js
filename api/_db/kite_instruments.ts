/**
 * Kite Instruments Database Schema
 */
import { db } from "./db";

/**
 * Initialize kite_instruments table schema
 */
function initializeInstrumentsSchema() {
  // Create kite_instruments table
  db.run(`
    CREATE TABLE IF NOT EXISTS kite_instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_token INTEGER NOT NULL,
      exchange_token INTEGER NOT NULL,
      tradingsymbol TEXT NOT NULL,
      name TEXT,
      last_price REAL NOT NULL DEFAULT 0,
      expiry TEXT,
      strike REAL NOT NULL DEFAULT 0,
      tick_size REAL NOT NULL DEFAULT 0,
      lot_size INTEGER NOT NULL DEFAULT 0,
      instrument_type TEXT,
      segment TEXT,
      exchange TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Single column index for instrument_token queries
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_instrument_token
    ON kite_instruments(instrument_token)
  `);

  // Composite index for name + segment + expiry + strike queries
  // Covers: name, segment, expiry filtering and strike range/ordering
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_name_segment_expiry_strike
    ON kite_instruments(name, segment, expiry, strike)
  `);

  // Composite index for exchange + tradingsymbol queries
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_exchange_tradingsymbol
    ON kite_instruments(exchange, tradingsymbol)
  `);

  console.log("Kite instruments schema initialized");
}

// Initialize schema on module load
initializeInstrumentsSchema();

// Re-export db for convenience
export { db };
