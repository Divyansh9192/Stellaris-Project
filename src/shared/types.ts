export type SourceKind = "none" | "text-input" | "textarea" | "contenteditable";

export interface PromptAction {
  id: string;
  name: string;
  template: string;
  description?: string;
}

export interface ExtensionSettings {
  endpointUrl: string;
  selectedModel: string;
  actions: PromptAction[];
}

export interface SelectionContext {
  text: string;
  pageTitle: string;
  pageUrl: string;
  canInsert: boolean;
  sourceKind: SourceKind;
}

export interface ListModelsResponse {
  models: string[];
}

export interface GenerationHealthResponse {
  ok: boolean;
  status?: number;
  reason?: string;
  bodySnippet?: string;
}

export interface RequestSiteAccessResponse {
  granted: boolean;
  origin?: string;
  reason?: string;
}

export interface StartGenerationPayload {
  requestId: string;
  actionId: string;
  model: string;
  context: SelectionContext;
}

export interface GenerationChunkPayload {
  requestId: string;
  chunk: string;
}

export interface GenerationDonePayload {
  requestId: string;
  fullText: string;
}

export interface GenerationErrorPayload {
  requestId: string;
  message: string;
}

export interface InsertResultPayload {
  text: string;
}

export interface BootstrapTabPayload {
  tabId: number;
  tabUrl: string;
  originPattern: string;
}

export interface RuntimeMessageMap {
  REQUEST_SITE_ACCESS: { request: null; response: RequestSiteAccessResponse };
  BOOTSTRAP_TAB: { request: BootstrapTabPayload; response: { ok: boolean; error?: string } };
  LIST_MODELS: { request: { endpointUrl?: string } | null; response: ListModelsResponse };
  CHECK_GENERATION_HEALTH: { request: { endpointUrl?: string; model: string }; response: GenerationHealthResponse };
  START_GENERATION: { request: StartGenerationPayload; response: void };
  GENERATION_CHUNK: { request: GenerationChunkPayload; response: void };
  GENERATION_DONE: { request: GenerationDonePayload; response: void };
  GENERATION_ERROR: { request: GenerationErrorPayload; response: void };
  ABORT_GENERATION: { request: { requestId: string }; response: void };
  INSERT_RESULT: { request: InsertResultPayload; response: void };
  OPEN_HELPER: { request: null; response: void };
}

export type RuntimeMessageType = keyof RuntimeMessageMap;

export type RuntimeEnvelope<T extends RuntimeMessageType> = {
  type: T;
  payload: RuntimeMessageMap[T]["request"];
};

export type AnyRuntimeEnvelope = {
  [Key in RuntimeMessageType]: RuntimeEnvelope<Key>;
}[RuntimeMessageType];

export type RuntimeResponseEnvelope<T extends RuntimeMessageType> = RuntimeMessageMap[T]["response"];
