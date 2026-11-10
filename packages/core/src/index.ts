/**
 * @gateway/core: everything other packages may use. Adapters (@gateway/adapters)
 * implement the interfaces here; a deployment (@gateway/vercel) composes them
 * and hands requests to the handlers here. Nothing else in src/ is public: a
 * test keeps the other packages to this file.
 */

// ── Composition: what a deployment hands the core ──
export { channel, compose, host, isComposed, persona } from "./composition.js";
export type {
  Composition,
  ConsoleGuide,
  Database,
  DatabaseStatus,
  HandoffRequest,
  Host,
  Persona,
} from "./composition.js";

// ── Settings: how an adapter or a host reads its own ──
export { config, envValue, instanceSettings, settingInt, settingJson, settingKey, settingValue } from "./config.js";
export type { SettingDef, SettingGroup } from "./settings/catalog.js";

// ── Modules and their capabilities: what a provider implements ──
export { READY, notReady } from "./modules/types.js";
export type { Balance, Capability, ConfigDecl, Module, Provider, Readiness } from "./modules/types.js";
export type { Tool, ToolContext } from "./modules/tool.js";
export { basicsModule, chatModule, imageModule, memoryModule, modelModule, sandboxModule, searchModule, voiceModule } from "./modules/index.js";
export { searchCapability } from "./modules/search/capability.js";
export type { SearchBackend, SearchHit } from "./modules/search/capability.js";
export { memoryCapability } from "./modules/memory/capability.js";
export type { MemoryHit, MemoryMetadata, VectorMemory } from "./modules/memory/capability.js";
export { sandboxCapability } from "./modules/sandbox/capability.js";
export type { SandboxBackend } from "./modules/sandbox/capability.js";
export { WORKDIR } from "./modules/sandbox/paths.js";
export type { Workspace } from "./modules/sandbox/workspace.js";
export { imageCapability } from "./modules/image/capability.js";
export type { ImageBackend, ImageRequest, ImageResult } from "./modules/image/capability.js";
export { speechCapability } from "./modules/voice/capability.js";
export type { SpeechBackend, VoiceChoice } from "./modules/voice/capability.js";
export { chatModelCapability } from "./modules/model/capability.js";
export type { ChatModel, ModelAccount } from "./modules/model/capability.js";

// ── Model messages: what a chat model provider takes and returns ──
export { ModelCallError, OutOfCreditError } from "./llm/errors.js";
export type {
  AssistantMessage,
  ImageContent,
  LlmRequest,
  Message,
  ModelIdentity,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolChoice,
  ToolDefinition,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "./llm/types.js";

// ── Helpers adapters share ──
export { getJson } from "./modules/shared/http.js";
export { bundledDataUrl } from "./media/assets.js";

// ── Channels: what a channel adapter implements ──
export { chunkText, json } from "./channels/types.js";
export type { Attachment, ChannelAdapter, InboundMessage, OutgoingFile, OutgoingVoice, Person, ReceiveResult, TextPart } from "./channels/types.js";
export { ChannelUnreachableError, PushRefusedError, platformFetch, unreachableReason } from "./channels/net.js";
export { partsToText, personLabel } from "./channels/format.js";

// ── Store: what a store implements ──
export { MemoryStore, SCHEMA_VERSION, getStore } from "./store/index.js";
export { LockLostError, SchemaOutdatedError } from "./store/types.js";
export type {
  AdminLogEntry,
  ChatSummary,
  IngestInput,
  IngestStatus,
  LockMode,
  NewStoredEvent,
  SessionState,
  Store,
  StoredEvent,
  StoredSetting,
  TurnProblem,
  UsageCounts,
} from "./store/types.js";

// ── Handlers: what a host routes requests to ──
export { channelFromUrl, handleWebhook, publicOrigin } from "./webhook.js";
export { handleAdmin } from "./admin/handler.js";
export { healthReport } from "./health.js";
export { refreshSettings } from "./settings/service.js";
export { runChat } from "./runtime/runner.js";
export type { ChatMeta } from "./runtime/runner.js";
export { takeOver } from "./runtime/lock.js";
