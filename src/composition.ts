/**
 * What a deployment is made of, given by the deployment (deploy/<target>/),
 * like DeepSeek Harness's cordis.yml: which modules, which providers for their
 * capabilities, which channels, which store, which host, which persona. The
 * core never names any of them; it reads them from here.
 *
 *   src/                 the core: interfaces, the agent, the runtime, the modules
 *   src/adapters/<x>/    one outside service each: providers, channels, the store
 *   src/personas/<x>/    who the bot is
 *   deploy/<target>/     a composition, its host, and its admin console's wiring
 *
 * A deployment calls compose() once, before handling anything. Everything here
 * is read when used, never while the files load, so the order files load in
 * doesn't matter.
 */
import type { ChannelAdapter } from "./channels/types.js";
import type { Balance, ConfigDecl, Module, Provider } from "./modules/types.js";
import type { Store } from "./store/types.js";

/** Where the gateway runs: what it can do beyond answering a request. */
export interface Host {
  /** "vercel", "node"… */
  id: string;
  label: string;
  /** Keep working on `task` after the response is sent (Vercel: waitUntil). */
  background(task: Promise<unknown>): void;
  /**
   * How long a run may last from the request that started it (ms): the
   * function's time limit, or for a long-running process a generous cap per run.
   */
  runBudgetMs(): number;
  /**
   * Continue a chat's run elsewhere when this one is out of time (Vercel: a
   * fresh function). Hosts without a time limit don't need it. True once accepted.
   *
   * The run still holds the chat's lock; `lockOwner` is its owner id, which
   * only the run and the store know. Whatever continues takes the lock over
   * with it (takeOver in src/runtime/lock.ts), which also proves the request
   * came from the run: no shared secret is needed.
   */
  handoff?(origin: string, request: HandoffRequest): Promise<boolean>;
  /** Its own settings, collected into the catalog. */
  config?: ConfigDecl;
  /** Response headers that let its CDN keep a static file (the console's page and scripts). */
  cdnCache?: Record<string, string>;
}

/** Where the store stands, for the console's setup guide. */
export interface DatabaseStatus {
  /** What it is ("Supabase"). */
  label: string;
  /** Whether the deployment can reach it (its connection settings are there); false: the guide's database steps. */
  connected: boolean;
  /** Whether its tables are what this code needs (Store.schemaVersion() === SCHEMA_VERSION). */
  ready: boolean;
  /** Its tables' version; null when there are none. */
  version: number | null;
  expected: number;
  /** Whether the console can create or upgrade the tables itself (apply()). */
  canApply: boolean;
  /** How apply() does it, or why it can't. */
  applyNote: string;
  /** How to run schema() by hand. */
  manualNote: string;
}

/** A run handing its chat over (Host.handoff). */
export interface HandoffRequest {
  chatKey: string;
  /** The run lock's owner id: the ticket to take the run over. */
  lockOwner: string;
  /** The sampler window was already claimed for this run (an ambient message woke it). */
  ambientClaimed?: boolean;
}

/** The store's own setup (create or upgrade its tables), for the console. */
export interface Database {
  status(): Promise<DatabaseStatus>;
  /** Create or upgrade the tables (idempotent). */
  apply(): Promise<void>;
  /** The SQL, for people to run by hand. */
  schema(): Promise<string>;
}

/** Who the bot is (src/personas/<x>): everything about her that isn't how a tool works. */
export interface Persona {
  /** What she calls herself, and what the chat calls her ({{bot_name}}). */
  name: string;
  /** Who she is: the first section of the system prompt. Names no tools. */
  prompt: string;
  /** How she acts with each module's tools, by module id; shown only while that module is on. */
  examples: Record<string, string[]>;
  /** Her looks, for an image model drawing her from her picture (English). */
  appearanceForImages: string;
  /** Her picture, a file in the deployment or an https URL: the image module's default self-reference. */
  picture?: string;
  /** A short clip of her talking, and what it says: the speech module's default voice to clone. */
  voice?: { clip: string; transcript: string };
  /** Her stickers (send_sticker): name → file under `baseUrl` and when to use it. None: no send_sticker. */
  stickers?: { set: Record<string, { file: string; when: string }>; baseUrl: string };
}

/** What's left on the chat model's key, from the service behind it (the model module's get_llm_key_limit). */
export interface ModelAccount {
  balance(llm: { baseUrl: string; apiKey: string; headers: Record<string, string> }): Promise<Balance>;
}

/** What the admin console says that depends on where it's deployed. */
export interface ConsoleGuide {
  /** Where it runs, in words ("Vercel"). */
  label: string;
  /** How to set ADMIN_PASSWORD here, shown before anyone can sign in: steps. */
  password: string[];
  /** How to change it later, one line. */
  changePassword: string;
  /** How to connect the database here, when it isn't (DatabaseStatus.connected): an intro line, then steps. */
  database: { intro: string; steps: string[] };
}

export interface Composition {
  host: Host;
  persona: Persona;
  /** Module definitions, in order; each is called once (src/modules/types.ts). */
  modules: Array<() => Module>;
  /** Implementations of the modules' capabilities (each names its capability). */
  providers: Provider<unknown>[];
  channels: ChannelAdapter[];
  /** How to read the chat model's balance; without it the model module has no get_llm_key_limit. */
  modelAccount?: ModelAccount;
  /** The store, made on first use. */
  store(): Store;
  /** The store's setup; without it the store needs none (memory). */
  database?: Database;
  guide: ConsoleGuide;
}

interface Composed extends Omit<Composition, "modules" | "store"> {
  modules: readonly Module[];
  store: Store | undefined;
  makeStore: () => Store;
}

let current: Composed | undefined;

/** Called once by the deployment, before anything else. Calling it again replaces it (tests). */
export function compose(c: Composition): void {
  current = { ...c, modules: [], store: undefined, makeStore: c.store };
  // Definitions may read the rest (the persona, for defaults), so they run once it's in place.
  current.modules = c.modules.map((define) => define());
}

function composed(): Composed {
  if (!current) throw new Error("the gateway isn't composed yet: a deployment calls compose() first (deploy/<target>/composition.ts)");
  return current;
}

export const host = (): Host => composed().host;
export const persona = (): Persona => composed().persona;
export const modules = (): readonly Module[] => composed().modules;
export const providers = (): Provider<unknown>[] => composed().providers;
export const channels = (): ChannelAdapter[] => composed().channels;
export const channel = (name: string): ChannelAdapter | undefined => composed().channels.find((c) => c.name === name);
export const database = (): Database | undefined => composed().database;
export const modelAccount = (): ModelAccount | undefined => composed().modelAccount;
export const guide = (): ConsoleGuide => composed().guide;

/** The store, made once. */
export function store(): Store {
  const c = composed();
  return (c.store ??= c.makeStore());
}

/** Whether compose() has run (the catalog reads only the core settings until then). */
export const isComposed = (): boolean => current !== undefined;
