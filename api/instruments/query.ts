/**
 * Query instruments from the database
 */
import { db } from "../_db/kite_instruments";
import { successResponse, inputError, dbError } from "../_shared/responses";
import { isRefreshRequired } from "./refresh-check";
import { performInstrumentsRefresh } from "./refresh";

/**
 * Valid query fields that can be used to filter instruments
 */
const VALID_QUERY_FIELDS = [
  "instrument_token",
  "tradingsymbol",
  "name",
  "expiry",
  "strike",
  "instrument_type",
  "segment",
  "exchange",
] as const;

/**
 * Valid fields for ordering results
 */
const VALID_ORDER_BY_FIELDS = [
  "instrument_token",
  "exchange_token",
  "tradingsymbol",
  "name",
  "last_price",
  "expiry",
  "strike",
  "tick_size",
  "lot_size",
  "instrument_type",
  "segment",
  "exchange",
  "updated_at",
] as const;

type QueryField = (typeof VALID_QUERY_FIELDS)[number];
type OrderByField = (typeof VALID_ORDER_BY_FIELDS)[number];

export async function handleQuery(req: Request): Promise<Response> {
  try {
    // Only allow GET requests
    if (req.method !== "GET") {
      return inputError("Method not allowed");
    }

    // Check if data refresh is required before querying
    if (isRefreshRequired()) {
      console.log("Data is stale, triggering automatic refresh...");
      try {
        const result = await performInstrumentsRefresh();
        if (result.success) {
          console.log(`Refresh completed: ${result.count} instruments updated`);
        } else {
          console.warn("Refresh failed, continuing with stale data:", result.error);
        }
      } catch (error) {
        console.warn("Refresh error, continuing with stale data:", error);
      }
    }

    // Parse URL to get query parameters
    const url = new URL(req.url);
    const params = url.searchParams;

    // Check if any query parameters are provided
    if (params.toString() === "") {
      return inputError("At least one query parameter is required");
    }

    // Extract special parameters (order_by, order, limit, strike_min, strike_max)
    const orderByParam = params.get("order_by");
    const orderParam = params.get("order")?.toLowerCase() || "asc";
    const limitParam = params.get("limit");
    const strikeMinParam = params.get("strike_min");
    const strikeMaxParam = params.get("strike_max");

    // Validate order parameter
    if (orderParam !== "asc" && orderParam !== "desc") {
      return inputError("order parameter must be either 'asc' or 'desc'");
    }

    // Validate order_by parameter
    if (
      orderByParam &&
      !VALID_ORDER_BY_FIELDS.includes(orderByParam as OrderByField)
    ) {
      return inputError(
        `Invalid order_by field: ${orderByParam}. Valid fields: ${VALID_ORDER_BY_FIELDS.join(
          ", "
        )}`
      );
    }

    // Validate and parse limit parameter
    let limit: number | undefined;
    if (limitParam) {
      limit = parseInt(limitParam);
      if (isNaN(limit) || limit < 1) {
        return inputError("limit parameter must be a positive integer");
      }
      if (limit > 10000) {
        return inputError("limit parameter cannot exceed 10000");
      }
    }

    // Validate and parse strike_min parameter
    let strikeMin: number | undefined;
    if (strikeMinParam) {
      strikeMin = parseFloat(strikeMinParam);
      if (isNaN(strikeMin)) {
        return inputError("strike_min parameter must be a valid number");
      }
    }

    // Validate and parse strike_max parameter
    let strikeMax: number | undefined;
    if (strikeMaxParam) {
      strikeMax = parseFloat(strikeMaxParam);
      if (isNaN(strikeMax)) {
        return inputError("strike_max parameter must be a valid number");
      }
    }

    // Validate strike range
    if (strikeMin !== undefined && strikeMax !== undefined && strikeMin > strikeMax) {
      return inputError("strike_min cannot be greater than strike_max");
    }

    // Build query filters
    const filters: Record<string, string> = {};
    const invalidParams: string[] = [];

    for (const [key, value] of params.entries()) {
      // Skip special parameters
      if (key === "order_by" || key === "order" || key === "limit" || key === "strike_min" || key === "strike_max") {
        continue;
      }

      if (VALID_QUERY_FIELDS.includes(key as QueryField)) {
        filters[key] = value;
      } else {
        invalidParams.push(key);
      }
    }

    // Warn about invalid parameters
    if (invalidParams.length > 0) {
      console.warn(
        `Invalid query parameters ignored: ${invalidParams.join(", ")}`
      );
    }

    // Check if we have valid filters or strike range
    if (Object.keys(filters).length === 0 && strikeMin === undefined && strikeMax === undefined) {
      return inputError(
        `No valid query parameters provided. Valid fields: ${VALID_QUERY_FIELDS.join(
          ", "
        )}, strike_min, strike_max`
      );
    }

    console.log("Querying instruments with filters:", filters);
    if (strikeMin !== undefined) console.log(`Strike min: ${strikeMin}`);
    if (strikeMax !== undefined) console.log(`Strike max: ${strikeMax}`);
    if (orderByParam) console.log(`Ordering by: ${orderByParam} ${orderParam}`);
    if (limit) console.log(`Limit: ${limit}`);

    // Build SQL query
    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    // Apply filters
    for (const [field, value] of Object.entries(filters)) {
      // For numeric and date fields, use exact match
      if (
        field === "instrument_token" ||
        field === "strike" ||
        field === "expiry"
      ) {
        whereClauses.push(`${field} = ?`);
        queryParams.push(value);
      }
      // For all text fields, use exact case-insensitive match
      else {
        whereClauses.push(`${field} = ? COLLATE NOCASE`);
        queryParams.push(value);
      }
    }

    // Apply strike range filters (both inclusive)
    if (strikeMin !== undefined) {
      whereClauses.push(`strike >= ?`);
      queryParams.push(strikeMin);
    }
    if (strikeMax !== undefined) {
      whereClauses.push(`strike <= ?`);
      queryParams.push(strikeMax);
    }

    // Build the complete SQL query
    let sql = `
      SELECT
        id,
        instrument_token,
        exchange_token,
        tradingsymbol,
        name,
        last_price,
        expiry,
        strike,
        tick_size,
        lot_size,
        instrument_type,
        segment,
        exchange,
        updated_at
      FROM kite_instruments
      WHERE ${whereClauses.join(" AND ")}
    `;

    // Apply ordering
    if (orderByParam) {
      sql += ` ORDER BY ${orderByParam} ${orderParam.toUpperCase()}`;
    }

    // Apply limit
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    console.log("Executing SQL:", sql);
    console.log("With params:", queryParams);

    // Execute query
    let data: any[];
    try {
      const stmt = db.prepare(sql);
      data = stmt.all(...queryParams) as any[];
    } catch (error) {
      console.error("Database error:", error);
      return dbError(
        error instanceof Error ? error.message : "Database query failed"
      );
    }

    console.log(`Query returned ${data.length} results`);

    // Build query metadata
    const queryMeta: any = {
      filters: filters,
    };

    if (strikeMin !== undefined) {
      queryMeta.strike_min = strikeMin;
    }

    if (strikeMax !== undefined) {
      queryMeta.strike_max = strikeMax;
    }

    if (orderByParam) {
      queryMeta.order_by = orderByParam;
      queryMeta.order = orderParam;
    }

    if (limit) {
      queryMeta.limit = limit;
    }

    return successResponse({
      count: data.length,
      query: queryMeta,
      instruments: data,
    });
  } catch (error) {
    console.error("Error in query handler:", error);
    return dbError(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
