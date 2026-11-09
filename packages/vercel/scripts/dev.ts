/**
 * Local development: `npm run dev` (from the repository root or here). Serves
 * this deployment's handlers on a plain Node server: webhooks at
 * /api/webhook/<channel>, the hand-over at /api/worker, the console at /admin.
 * Loads `.env.local` from the repository root if present. Expose it with a
 * tunnel (cloudflared, ngrok) to receive real QQ / Telegram webhooks.
 */
import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../../.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const { admin, webhook, worker } = await import("../src/index.js");

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
      if (pathname.startsWith("/api/webhook/")) response = await webhook(request);
      else if (pathname === "/api/worker") response = await worker(request);
      else if (/^\/(api\/)?admin(\/|$)/.test(pathname)) response = await admin(request);
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
