/** The modules page: each module's state, providers, tools, and exactly what it adds to the system prompt. */
import { moduleById, Toolset } from "../../modules/registry.js";
import { assemble } from "../../prompt/assemble.js";
import { describeModule, describeModules } from "../modules.js";
import { HttpError, type Route } from "../http.js";

export const moduleRoutes: Route[] = [
  { method: "GET", path: "modules", handler: () => describeModules() },
  {
    method: "GET",
    path: "modules/:id",
    handler(_req, { id }) {
      const module = moduleById(id!);
      if (!module) throw new HttpError(404, `没有 ${id} 模块`);
      const view = describeModule(module);
      if (!view.ok) return { ...view, sections: [], definitions: [] };
      // As a group would get it with every module on: the module's own section and tool definitions.
      const toolset = new Toolset();
      const sections = (["group", "private"] as const).map((chatType) => ({
        chatType,
        text: assemble({ chatType, toolset }).sections.find((s) => s.name === `module:${module.id}`)?.text ?? "",
      }));
      const names = new Set(module.tools.map((t) => t.name));
      return {
        ...view,
        sections,
        definitions: toolset.definitions().filter((d) => names.has(d.name)),
      };
    },
  },
];
