/**
 * The request body override every provider instance that sends a JSON body
 * has ({MODULE}_{INSTANCE}_EXTRA_BODY): a JSON object merged, level by level,
 * into the final request body, as the last step before it's sent. So it can
 * set or change any field, the ones the gateway builds included:
 *
 *   an object into an object  merged key by key, the same way, all the way down;
 *   anything else             (a value, an array) replaces what's there;
 *   null                      removes the field.
 *
 * What it changes is the instance's to answer for: a request it breaks fails.
 */
import type { SettingDef } from "../../settings/catalog.js";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** `body` with `override` merged in level by level (a new object; neither is changed). */
export function overrideBody<T extends Json>(body: T, override: Json): T {
  const result: Json = { ...body };
  for (const [key, value] of Object.entries(override)) {
    if (value === null) delete result[key];
    else if (isObject(value) && isObject(result[key])) result[key] = overrideBody(result[key] as Json, value);
    else result[key] = structuredClone(value);
  }
  return result as T;
}

/** The override's setting, the same in every instance's group. `example`: a JSON object that makes sense for this API. */
export function bodyOverrideSetting(key: string, group: string, example: string, note = ""): SettingDef {
  return {
    key,
    group,
    label: "请求体覆盖",
    kind: "json",
    help:
      "JSON 对象，发送前最后一步按层级合并进请求体，任何字段都能改：对象逐层合并，其他值（包括数组）整体替换，null 删掉这个字段。" +
      `网关生成的字段也会被覆盖，改坏了请求会出错。${note}例如 ${example}`,
  };
}
