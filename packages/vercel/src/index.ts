/**
 * The Vercel deployment: its entries (api/*.ts) import from here only. Each
 * handler composes the gateway first (composition.ts).
 */
import { channelFromUrl, handleAdmin, handleWebhook, healthReport } from "@gateway/core";
import { composeVercel } from "./composition.js";
import { handleWorker } from "./worker.js";

composeVercel();

export const admin = (request: Request) => handleAdmin(request);
export const webhook = (request: Request) => handleWebhook(request, channelFromUrl(request.url));
export const worker = (request: Request) => handleWorker(request);
export const health = () => healthReport();
