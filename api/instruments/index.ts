/**
 * Instruments API endpoints
 */
import { Hono } from "hono";
import { handleRefresh } from "./refresh";
import { handleQuery } from "./query";

const instruments = new Hono();

instruments.get("/refresh", async (c) => {
  const response = await handleRefresh(c.req.raw);
  return response;
});

instruments.get("/query", async (c) => {
  const response = await handleQuery(c.req.raw);
  return response;
});

export default instruments;
