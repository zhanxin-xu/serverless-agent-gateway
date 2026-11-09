# The system prompt before the module refactor

What the model got before `docs/design/modules.md` was carried out: the prompt
per scene and channel (no per-chat extra settings), and every tool definition
with all features configured. Made by `scripts/prompt-snapshot-v1.ts` at commit
e6997d6, which needs the code of that commit to run.

`scripts/prompt-report.ts` compares the prompt now against these.
