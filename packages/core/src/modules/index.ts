/**
 * The modules the core comes with (docs/modules.md). Each is a definition the
 * composition calls once; which of them a deployment loads, and in what
 * order, is up to its composition (deploy/<target>/composition.ts), like
 * DeepSeek Harness's cordis.yml. The order is the order of their tools in a
 * request and of their cards in the console; where their prompt sections go is
 * each module's own `section.order`.
 *
 * A module's outside services are capabilities whose providers live in
 * src/adapters and are also chosen by the composition.
 */
export { basicsModule } from "./basics/index.js";
export { chatModule } from "./chat/index.js";
export { imageModule } from "./image/index.js";
export { memoryModule } from "./memory/index.js";
export { modelModule } from "./model/index.js";
export { sandboxModule } from "./sandbox/index.js";
export { searchModule } from "./search/index.js";
export { voiceModule } from "./voice/index.js";
