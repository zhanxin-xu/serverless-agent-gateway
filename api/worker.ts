import { worker } from "../deploy/vercel/index.js";

// POST /api/worker — internal hand-off between runs (signed).
export default { fetch: worker };
