import { Hono } from "hono";
import index from "./api/index";
import user from "./api/user";
import instruments from "./api/instruments";
// Import both table schemas to ensure initialization
import "./api/_db/kite_instruments";
import "./api/_db/kite_users";

const app = new Hono();

// Mount route groups
app.route("/", index);
app.route("/user", user);
app.route("/instruments", instruments);

export default {
  port: 3000,
  fetch: app.fetch,
};
