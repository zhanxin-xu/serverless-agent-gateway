import { webhook } from "../../deploy/vercel/index.js";

// POST /api/webhook/:channel  (the composition's channels: qq | telegram | http)
export default { fetch: webhook };
