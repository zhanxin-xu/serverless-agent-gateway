import { webhook } from "../../src/index.js";

// POST /api/webhook/:channel  (the composition's channels: qq | telegram | http)
export default { fetch: webhook };
