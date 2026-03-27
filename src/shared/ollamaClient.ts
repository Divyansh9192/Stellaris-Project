import { DEFAULT_ENDPOINT } from "./constants";
import { normalizeEndpoint } from "./loopback";
import { parseOllamaJsonLines } from "./ollama";
import type { GenerationHealthResponse } from "./types";

type FetchLike = typeof fetch;

const MAX_ERROR_SNIPPET = 220;

const toSingleLine = (value: string): string => value.replace(/\s+/g, " ").trim();

const readErrorSnippet = async (response: Response): Promise<string> => {
  try {
    const text = await response.text();
    return toSingleLine(text).slice(0, MAX_ERROR_SNIPPET);
  } catch {
    return "";
  }
};

const formatHttpFailure = (label: string, status: number, bodySnippet: string): string =>
  bodySnippet
    ? `${label} with status ${status}. Response: ${bodySnippet}`
    : `${label} with status ${status}.`;

export interface StreamOllamaGenerateOptions {
  endpointUrl: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

export interface CheckOllamaGenerationHealthOptions {
  endpointUrl: string;
  model: string;
}

export const fetchOllamaModels = async (
  endpointUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> => {
  const endpoint = normalizeEndpoint(endpointUrl || DEFAULT_ENDPOINT);
  const response = await fetchImpl(`${endpoint}/api/tags`);

  if (!response.ok) {
    throw new Error(`Model discovery failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { models?: Array<{ name?: string }> };
  return (payload.models ?? [])
    .map((model) => model.name?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((left, right) => left.localeCompare(right));
};

export const checkOllamaGenerationHealth = async (
  options: CheckOllamaGenerationHealthOptions,
  fetchImpl: FetchLike = fetch,
): Promise<GenerationHealthResponse> => {
  const model = options.model.trim();
  if (!model) {
    return {
      ok: false,
      reason: "No model selected.",
    };
  }

  try {
    const endpoint = normalizeEndpoint(options.endpointUrl || DEFAULT_ENDPOINT);
    const response = await fetchImpl(`${endpoint}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: "health-check",
        stream: false,
      }),
    });

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    const bodySnippet = await readErrorSnippet(response);
    return {
      ok: false,
      status: response.status,
      reason: `Generation health check failed with status ${response.status}.`,
      bodySnippet: bodySnippet || undefined,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Generation health check failed.",
    };
  }
};

export const streamOllamaGenerate = async (
  options: StreamOllamaGenerateOptions,
  fetchImpl: FetchLike = fetch,
): Promise<string> => {
  const endpoint = normalizeEndpoint(options.endpointUrl || DEFAULT_ENDPOINT);
  const response = await fetchImpl(`${endpoint}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      stream: true,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const bodySnippet = await readErrorSnippet(response);
    throw new Error(formatHttpFailure("Generation failed", response.status, bodySnippet));
  }

  if (!response.body) {
    throw new Error("Generation failed because the response body was empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remainder = "";
  let fullText = "";
  let doneSeen = false;

  while (!doneSeen) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    remainder += decoder.decode(value, { stream: true });
    const parsed = parseOllamaJsonLines(remainder);
    remainder = parsed.remainder;

    for (const event of parsed.events) {
      if (event.error) {
        throw new Error(event.error);
      }

      if (event.response) {
        fullText += event.response;
        options.onChunk(event.response);
      }

      if (event.done) {
        doneSeen = true;
      }
    }
  }

  remainder += decoder.decode();
  const trailing = parseOllamaJsonLines(remainder);
  for (const event of trailing.events) {
    if (event.error) {
      throw new Error(event.error);
    }

    if (event.response) {
      fullText += event.response;
      options.onChunk(event.response);
    }
  }

  return fullText;
};
