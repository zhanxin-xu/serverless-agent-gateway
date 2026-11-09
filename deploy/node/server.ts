/**
 * The gateway as a plain Node HTTP server: `npm run dev` (restarts on
 * changes) or `npm start`. Webhooks at /api/webhook/<channel>, the admin
 * console at /admin. Loads `.env.local` if present.
 *
 * Platforms deliver messages by webhook, so to receive real QQ / Telegram
 * messages the server must be reachable from the internet (a tunnel such as
 * cloudflared or ngrok works). The HTTP channel needs nothing more.
 */
import { existsSync } from "node:fs";
import http from "node:http";
import { handleAdmin } from "../../src/admin/handler.js";
import { channelFromUrl, handleWebhook } from "../../src/webhook.js";
import { composeNode } from "./composition.js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
composeNode();

const port = Number(process.env.PORT ?? 3000);

http
  .createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);

      const { pathname } = new URL(url);
      const request = new Request(url, { method: req.method, headers, body: req.method === "GET" ? undefined : body });
      let response: Response;
      if (pathname.startsWith("/api/webhook/")) response = await handleWebhook(request, channelFromUrl(url));
      else if (/^\/(api\/)?admin(\/|$)/.test(pathname)) response = await handleAdmin(request);
      else {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error(err);
      res.writeHead(500).end("internal error");
    }
  })
  .listen(port, () => console.log(`gateway on http://localhost:${port}/api/webhook/{qq,telegram,http}, console at http://localhost:${port}/admin`));
