// Line icons for the console (24×24, drawn with the current text color). Built with the DOM, not markup.
const NS = "http://www.w3.org/2000/svg";

const PATHS = {
  overview: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  chats: ["M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  modules: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M17 14v6", "M14 17h6"],
  config: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  log: ["M8 6h13", "M8 12h13", "M8 18h13", "M3.5 6h.01", "M3.5 12h.01", "M3.5 18h.01"],
  setup: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
  back: ["m15 18-6-6 6-6"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "m21 21-4.3-4.3"],
  refresh: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v6h-6"],
  // The three appearances: follow the system, light, dark.
  auto: ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"],
  light: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2v2", "M12 20v2", "m4.9 4.9 1.4 1.4", "m17.7 17.7 1.4 1.4", "M2 12h2", "M20 12h2", "m4.9 19.1 1.4-1.4", "m17.7 6.3 1.4-1.4"],
  dark: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"],
};

/** An icon as an <svg> element; decorative (hidden from screen readers). */
export function icon(name, size = 16) {
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: "icon",
  })) {
    svg.setAttribute(k, String(v));
  }
  for (const d of PATHS[name] ?? []) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
