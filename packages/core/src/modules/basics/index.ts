/** Small helpers every chat has. They explain themselves, so no prompt section. */
import type { Module } from "../types.js";
import { calculate, getCurrentTime } from "./tools.js";

/** Called once by compose() (src/composition.ts), after every file has loaded and the persona is in place. */
export function basicsModule(): Module {
  return {
    id: "basics",
    label: "小工具",
    summary: "查当前时间、算数。每个聊天都有。",
    core: true,
    tools: [getCurrentTime, calculate],
  };
}
