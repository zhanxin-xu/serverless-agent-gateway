/** A GET with a bearer key, for the balance and limit endpoints of the services modules use. */
export async function getJson<T>(url: string, apiKey: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { ...headers, authorization: `Bearer ${apiKey}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${new URL(url).pathname} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}
