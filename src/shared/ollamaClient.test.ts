// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { checkOllamaGenerationHealth, fetchOllamaModels, streamOllamaGenerate } from "./ollamaClient";

let server: ReturnType<typeof createServer>;
let endpointUrl = "";

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const writeJsonLine = (response: ServerResponse, payload: unknown): void => {
  response.write(`${JSON.stringify(payload)}\n`);
};

beforeAll(async () => {
  server = createServer(async (request, response) => {
    if (request.url === "/api/tags") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ models: [{ name: "qwen2.5:3b" }, { name: "llama3.2:1b" }] }));
      return;
    }

    if (request.url === "/api/generate") {
      const body = await readBody(request);

      if (body.includes('"model":"forbidden-model"')) {
        response.writeHead(403, { "Content-Type": "text/plain" });
        response.end("forbidden by ollama origin policy");
        return;
      }

      if (body.includes('"stream":false')) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ response: "ok", done: true }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/x-ndjson" });
      if (body.includes("abort-me")) {
        writeJsonLine(response, { response: "partial" });
        setTimeout(() => {
          try {
            writeJsonLine(response, { response: " later", done: true });
            response.end();
          } catch {
            response.end();
          }
        }, 250);
        return;
      }

      writeJsonLine(response, { response: "Hello" });
      writeJsonLine(response, { response: " world", done: true });
      response.end();
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  endpointUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Ollama client helpers", () => {
  it("discovers model names", async () => {
    await expect(fetchOllamaModels(endpointUrl)).resolves.toEqual(["llama3.2:1b", "qwen2.5:3b"]);
  });

  it("streams and assembles generation output", async () => {
    const chunks: string[] = [];
    const result = await streamOllamaGenerate({
      endpointUrl,
      model: "qwen2.5:3b",
      prompt: "hello",
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(["Hello", " world"]);
    expect(result).toBe("Hello world");
  });

  it("supports aborting a streaming request", async () => {
    const controller = new AbortController();

    const promise = streamOllamaGenerate({
      endpointUrl,
      model: "qwen2.5:3b",
      prompt: "abort-me",
      signal: controller.signal,
      onChunk: () => {
        controller.abort();
      },
    });

    await expect(promise).rejects.toBeDefined();
  });

  it("includes status and response snippet on generation failure", async () => {
    await expect(
      streamOllamaGenerate({
        endpointUrl,
        model: "forbidden-model",
        prompt: "hello",
        onChunk: () => undefined,
      }),
    ).rejects.toThrow(/status 403/i);
    await expect(
      streamOllamaGenerate({
        endpointUrl,
        model: "forbidden-model",
        prompt: "hello",
        onChunk: () => undefined,
      }),
    ).rejects.toThrow(/forbidden by ollama origin policy/i);
  });

  it("returns unhealthy health probe response with status and snippet for 403", async () => {
    const result = await checkOllamaGenerationHealth({
      endpointUrl,
      model: "forbidden-model",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.bodySnippet).toContain("forbidden by ollama origin policy");
  });

  it("returns healthy health probe response when generation endpoint allows requests", async () => {
    const result = await checkOllamaGenerationHealth({
      endpointUrl,
      model: "qwen2.5:3b",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
    });
  });
});
