/**
 * Runs in the MAIN world (declared in manifest.json with "world": "MAIN").
 * Overrides window.fetch to intercept ChatGPT API calls and reroute them
 * to the local Ollama instance when local mode is enabled.
 *
 * Communicates with the ISOLATED world content script via window.postMessage.
 */

// Must be a module for declare global to work
export {};

declare global {
  interface Window {
    __stellarisInterceptorInstalled?: boolean;
    __stellarisLocalMode?: boolean;
    __stellarisModel?: string;
  }
}

if (!window.__stellarisInterceptorInstalled) {
  window.__stellarisInterceptorInstalled = true;
  window.__stellarisLocalMode = false;

  const _originalFetch = window.fetch.bind(window);

  // Listen for toggle/model updates from the ISOLATED-world content script
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;

    if (event.data?.type === "STELLARIS_SET_LOCAL_MODE") {
      window.__stellarisLocalMode = Boolean(event.data.enabled);
    }

    if (event.data?.type === "STELLARIS_SET_MODEL") {
      window.__stellarisModel = String(event.data.model ?? "");
    }
  });

  const CHATGPT_CONV_PATTERN = /chatgpt\.com\/backend-api\/(conversation|f\/)/;
  const OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";

  const buildOllamaBody = async (originalBody: BodyInit | null | undefined): Promise<string | null> => {
    if (!originalBody) return null;

    try {
      const text = typeof originalBody === "string"
        ? originalBody
        : await new Response(originalBody).text();
      const parsed = JSON.parse(text) as { messages?: unknown[] };
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const model = window.__stellarisModel || "llama3.2";
      return JSON.stringify({ model, messages, stream: true });
    } catch {
      return null;
    }
  };

  /**
   * Convert Ollama NDJSON stream → OpenAI SSE stream so ChatGPT's
   * frontend renders it without any DOM patching.
   *
   * Ollama: {"message":{"role":"assistant","content":"Hi"},"done":false}
   * OpenAI: data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n
   */
  const ollamaToOpenAiStream = (ollamaResponse: Response): ReadableStream<Uint8Array> => {
    const reader = ollamaResponse.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let remainder = "";
    const msgId = `chatcmpl-stellaris-${Math.random().toString(36).slice(2)}`;

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          remainder += decoder.decode(value, { stream: true });
          const lines = remainder.split("\n");
          remainder = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let event: { error?: string; message?: { content?: string }; done?: boolean; model?: string };
            try { event = JSON.parse(trimmed); } catch { continue; }

            if (event.error) {
              controller.error(new Error(event.error));
              return;
            }

            const chunk = event.message?.content ?? "";
            const openAiChunk = {
              id: msgId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: event.model ?? "local",
              choices: [{
                index: 0,
                delta: chunk ? { content: chunk } : {},
                finish_reason: event.done ? "stop" : null,
              }],
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAiChunk)}\n\n`));
          }
        }
      },
      cancel() { void reader.cancel(); },
    });
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input
      : input instanceof URL ? input.href
      : (input as Request).url;

    if (!window.__stellarisLocalMode || !CHATGPT_CONV_PATTERN.test(url)) {
      return _originalFetch(input, init);
    }

    const ollamaBody = await buildOllamaBody(init?.body);
    if (!ollamaBody) return _originalFetch(input, init);

    let ollamaResponse: Response;
    try {
      ollamaResponse = await _originalFetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: ollamaBody,
      });
    } catch (err) {
      console.warn("[Stellaris] Ollama unreachable, falling back to ChatGPT:", err);
      return _originalFetch(input, init);
    }

    if (!ollamaResponse.ok || !ollamaResponse.body) {
      console.warn("[Stellaris] Ollama returned", ollamaResponse.status, "— falling back.");
      return _originalFetch(input, init);
    }

    return new Response(ollamaToOpenAiStream(ollamaResponse), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  };
}
