/**
 * Index API endpoints
 */
import { Hono } from "hono";
import { handleHealth } from "./health";

const index = new Hono();

index.all("/health", async (c) => {
  return handleHealth(c.req.raw);
});

export default index;
