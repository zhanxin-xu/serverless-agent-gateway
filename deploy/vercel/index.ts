/**
 * The Vercel deployment: its entries (api/*.ts) import from here only. Each
 * handler composes the gateway first (composition.ts).
 */
import { handleAdmin } from "../../src/admin/handler.js";
import { healthReport } from "../../src/health.js";
import { channelFromUrl, handleWebhook } from "../../src/webhook.js";
import { composeVercel } from "./composition.js";
import { handleWorker } from "./worker.js";

composeVercel();

export const admin = (request: Request) => handleAdmin(request);
export const webhook = (request: Request) => handleWebhook(request, channelFromUrl(request.url));
export const worker = (request: Request) => handleWorker(request);
export const health = () => healthReport();
