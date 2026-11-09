/** Logging in and out. */
import { guide, persona } from "../../composition.js";
import { config } from "../../config.js";
import { getStore } from "../../store/index.js";
import { isLoggedIn, login, logoutCookie } from "../auth.js";
import { field, jsonResponse, type Route } from "../http.js";

export const sessionRoutes: Route[] = [
  {
    method: "GET",
    path: "session",
    public: true,
    // Without a password, how to set one where this is deployed (shown before anyone can sign in).
    handler: (req) =>
      // The bot's name titles the console, before sign-in too.
      config.admin.password
        ? { botName: persona().name, passwordSet: true, loggedIn: isLoggedIn(req.request) }
        : { botName: persona().name, passwordSet: false, loggedIn: false, howToSetPassword: guide().password },
  },
  {
    method: "POST",
    path: "session",
    public: true,
    async handler(req) {
      const cookie = await login(req, field(await req.json(), "password", { max: 200 }), getStore());
      return jsonResponse({ loggedIn: true }, 200, { "set-cookie": cookie });
    },
  },
  {
    method: "DELETE",
    path: "session",
    public: true,
    handler: (req) => jsonResponse({ loggedIn: false }, 200, { "set-cookie": logoutCookie(req) }),
  },
];
