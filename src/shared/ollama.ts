export interface OllamaStreamChunk {
  response?: string;
  done?: boolean;
  error?: string;
}

export const parseOllamaJsonLines = (buffer: string): { events: OllamaStreamChunk[]; remainder: string } => {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  const events: OllamaStreamChunk[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    events.push(JSON.parse(trimmed) as OllamaStreamChunk);
  }

  return { events, remainder };
};
