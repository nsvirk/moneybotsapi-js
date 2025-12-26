/**
 * Health check endpoint
 */
import { db } from "../_db/db";
import { getISTTimestamp } from "../_shared/time";
import { checkMethod } from "../_shared/responses";

// Track server start time
const startTime = Date.now();

export async function handleHealth(req: Request): Promise<Response> {
  try {
    // Check HTTP method
    const methodError = checkMethod(req, "GET");
    if (methodError) return methodError;

    // Get memory usage
    const memUsage = process.memoryUsage();

    // Format bytes to MB
    const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);

    // Check database connectivity
    let dbStatus = "ok";
    let instrumentCount = 0;
    let userCount = 0;
    try {
      const instrumentResult = db
        .prepare(
          "SELECT COUNT(instrument_token) as count FROM kite_instruments"
        )
        .get() as { count: number };
      instrumentCount = instrumentResult?.count || 0;

      const userResult = db
        .prepare("SELECT COUNT(id) as count FROM kite_users")
        .get() as { count: number };
      userCount = userResult?.count || 0;
    } catch (error) {
      dbStatus = "error";
      console.error("Database health check failed:", error);
    }

    // Calculate uptime
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    return new Response(
      JSON.stringify({
        status: "ok",
        timestamp: getISTTimestamp(),
        uptime: {
          milliseconds: uptimeMs,
          seconds: uptimeSeconds,
          minutes: uptimeMinutes,
          hours: uptimeHours,
          formatted: `${uptimeHours}h ${uptimeMinutes % 60}m ${
            uptimeSeconds % 60
          }s`,
        },
        memory: {
          rss: `${formatMB(memUsage.rss)} MB`,
          heapTotal: `${formatMB(memUsage.heapTotal)} MB`,
          heapUsed: `${formatMB(memUsage.heapUsed)} MB`,
          external: `${formatMB(memUsage.external)} MB`,
          arrayBuffers: `${formatMB(memUsage.arrayBuffers)} MB`,
          raw: {
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers,
          },
        },
        database: {
          status: dbStatus,
          instrumentCount: instrumentCount,
          userCount: userCount,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: getISTTimestamp(),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
