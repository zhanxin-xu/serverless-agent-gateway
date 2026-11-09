/**
 * The modules this gateway loads, in order: its composition, like DeepSeek
 * Harness's cordis.yml. Adding a module is writing its folder
 * (src/modules/<id>/index.ts, see docs/modules.md) and listing it here.
 * Its tools, prompt section, settings, switch, quota and console pages all
 * follow from its definition; nothing else names it.
 *
 * The order is the order of their tools in a request and of their cards in
 * the console; where their prompt sections go is each module's own `section.order`.
 *
 * Each module is a function the loader calls once, like a dsh plugin's
 * apply: the settings catalog reads the modules, config.ts reads the catalog,
 * and modules read config.ts, so nothing may be read while the files load.
 * The list is built on first call, after every module file has loaded,
 * whichever of them loads first.
 */
import { basicsModule } from "./basics/index.js";
import { chatModule } from "./chat/index.js";
import { imageModule } from "./image/index.js";
import { memoryModule } from "./memory/index.js";
import { modelModule } from "./model/index.js";
import { sandboxModule } from "./sandbox/index.js";
import { searchModule } from "./search/index.js";
import type { Module } from "./types.js";
import { voiceModule } from "./voice/index.js";

let list: readonly Module[] | undefined;

export function loadedModules(): readonly Module[] {
  return (list ??= [chatModule(), basicsModule(), modelModule(), memoryModule(), searchModule(), sandboxModule(), imageModule(), voiceModule()]);
}
