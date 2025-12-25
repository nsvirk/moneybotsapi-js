import { Hono } from "hono";
import user from "./api/user";
import instruments from "./api/instruments";
// Import both table schemas to ensure initialization
import "./api/_db/kite_instruments";
import "./api/_db/kite_users";
import { db } from "./api/_db/db";
import { getISTTimestamp } from "./api/_shared/time";

const app = new Hono();
const startTime = Date.now();

// Health check with memory usage and system metrics
app.get("/health", (c) => {
  try {
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

    return c.json({
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
    });
  } catch (error) {
    return c.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: getISTTimestamp(),
      },
      500
    );
  }
});

// Mount route groups
app.route("/user", user);
app.route("/instruments", instruments);

export default {
  port: 3000,
  fetch: app.fetch,
};
