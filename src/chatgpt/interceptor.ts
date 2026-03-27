/**
 * The fetch interceptor source — injected into the MAIN world so it can
 * override window.fetch before ChatGPT's own scripts set up their calls.
 *
 * Communication from the extension context uses window.postMessage with
 * the sentinel type "STELLARIS_SET_LOCAL_MODE".
 */
export const INTERCEPTOR_SOURCE = `
(function () {
  if (window.__stellarisInterceptorInstalled) return;
  window.__stellarisInterceptorInstalled = true;
  window.__stellarisLocalMode = false;

  const _originalFetch = window.fetch.bind(window);

  // Listen for toggle messages from the extension content-script context
  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.data?.type === "STELLARIS_SET_LOCAL_MODE"
    ) {
      window.__stellarisLocalMode = Boolean(event.data.enabled);
    }
  });

  const CHATGPT_CONV_PATTERN = /chatgpt\\.com\\/backend-api\\/(conversation|f\\/)/;
  const OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";

  /**
   * Convert the ChatGPT request body to Ollama /api/chat format.
   * ChatGPT sends { messages: [{role, content}], model, ... }
   * Ollama expects { model, messages: [{role, content}], stream }
   */
  async function buildOllamaBody(originalBody) {
    let parsed;
    try {
      parsed = typeof originalBody === "string"
        ? JSON.parse(originalBody)
        : JSON.parse(await new Response(originalBody).text());
    } catch {
      return null;
    }

    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];

    // Pull model from window flag (set by extension) or fall back to a default
    const model = window.__stellarisModel || "llama3.2";

    return JSON.stringify({ model, messages, stream: true });
  }

  /**
   * Turn an Ollama streaming response (NDJSON) into a ReadableStream that
   * mimics OpenAI's SSE format so ChatGPT's frontend renders it correctly.
   *
   * Ollama line format:  {"model":"...","message":{"role":"assistant","content":"chunk"},"done":false}
   * OpenAI SSE format:   data: {"id":"...","choices":[{"delta":{"content":"chunk"}}]}
   */
  function ollamaToOpenAiStream(ollamaResponse) {
    const reader = ollamaResponse.body.getReader();
    const decoder = new TextDecoder();
    let remainder = "";
    let msgId = "chatcmpl-stellaris-" + Math.random().toString(36).slice(2);

    return new ReadableStream({
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\\n\\n"));
            controller.close();
            return;
          }

          remainder += decoder.decode(value, { stream: true });
          const lines = remainder.split("\\n");
          remainder = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let event;
            try { event = JSON.parse(trimmed); } catch { continue; }

            if (event.error) {
              controller.error(new Error(event.error));
              return;
            }

            const chunk = event.message?.content || "";

            const openAiChunk = {
              id: msgId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: event.model || "local",
              choices: [{
                index: 0,
                delta: chunk ? { content: chunk } : {},
                finish_reason: event.done ? "stop" : null,
              }],
            };

            controller.enqueue(
              new TextEncoder().encode("data: " + JSON.stringify(openAiChunk) + "\\n\\n")
            );
          }
        }
      },
      cancel() { reader.cancel(); },
    });
  }

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.href
      : input instanceof Request ? input.url
      : String(input);

    if (!window.__stellarisLocalMode || !CHATGPT_CONV_PATTERN.test(url)) {
      return _originalFetch(input, init);
    }

    // Build the Ollama request body from the original ChatGPT request
    const ollamaBody = await buildOllamaBody(init?.body ?? null);
    if (!ollamaBody) {
      return _originalFetch(input, init);
    }

    let ollamaResponse;
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
      console.warn("[Stellaris] Ollama returned non-OK status", ollamaResponse.status, "— falling back.");
      return _originalFetch(input, init);
    }

    // Return a mock Response that looks like OpenAI's streaming response
    return new Response(ollamaToOpenAiStream(ollamaResponse), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  };
})();
`;
