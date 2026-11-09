import { worker } from "../deploy/vercel/index.js";

// POST /api/worker — internal hand-off between runs (the run's lock is the ticket).
export default { fetch: worker };
