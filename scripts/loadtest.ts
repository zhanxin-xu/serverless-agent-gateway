/**
 * Load-order test: `npm run test:load` (slow: one process per file).
 *
 * The modules, the settings catalog and config.ts import each other (the
 * catalog reads every module's settings; modules read config; config reads
 * the catalog), which is safe only while nothing is read during loading
 * (src/modules/index.ts). This loads each file under src/modules, src/persona,
 * src/settings and src/prompt first, in a fresh process, then reads the
 * catalog and the module list, so a file that reads another's export while
 * loading fails here rather than in whichever entry point happens to load it first.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
};
for (const dir of ["src/modules", "src/persona", "src/settings", "src/prompt"]) walk(path.join(root, dir));

const work = mkdtempSync(path.join(tmpdir(), "loadtest-"));
const probe = path.join(work, "probe.mts");
let failed = 0;
try {
  for (const file of files) {
    writeFileSync(
      probe,
      [
        `await import(${JSON.stringify(file)});`,
        `const { settingDefs } = await import(${JSON.stringify(path.join(root, "src/settings/catalog.ts"))});`,
        `const { MODULES } = await import(${JSON.stringify(path.join(root, "src/modules/registry.ts"))});`,
        `if (!settingDefs().length || !MODULES.length) throw new Error("the catalog or the module list is empty");`,
      ].join("\n"),
    );
    try {
      execFileSync("npx", ["tsx", probe], { cwd: root, stdio: "pipe", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    } catch (err) {
      failed++;
      const line = String((err as { stderr?: Buffer }).stderr ?? err).split("\n").find((l) => /Error/.test(l));
      console.error(`✗ ${path.relative(root, file)}: ${line}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failed) {
  console.error(`${failed} of ${files.length} files fail when loaded first`);
  process.exit(1);
}
console.log(`all ${files.length} files load first without errors`);
