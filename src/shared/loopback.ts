const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const isLoopbackEndpoint = (input: string): boolean => {
  try {
    const url = new URL(input);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

export const normalizeEndpoint = (input: string): string => {
  const trimmed = input.trim();
  if (!isLoopbackEndpoint(trimmed)) {
    throw new Error("Only http://localhost or http://127.0.0.1 endpoints are allowed.");
  }

  const url = new URL(trimmed);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};
