import { health } from "../deploy/vercel/index.js";

// GET /api/health — what is configured (no secrets exposed).
export default { fetch: health };
