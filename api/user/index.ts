/**
 * User API endpoints
 */
import { Hono } from "hono";
import { handleRegister } from "./register";
import { handleLogin } from "./login";
import { handleLogout } from "./logout";
import { handleTotp } from "./totp";

const user = new Hono();

user.post("/register", async (c) => {
  return handleRegister(c.req.raw);
});

user.post("/login", async (c) => {
  return handleLogin(c.req.raw);
});

user.delete("/logout", async (c) => {
  return handleLogout(c.req.raw);
});

user.post("/totp", async (c) => {
  return handleTotp(c.req.raw);
});

export default user;
