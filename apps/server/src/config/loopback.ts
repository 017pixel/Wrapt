const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackHost(value: string): boolean {
  return loopbackHosts.has(value.trim().toLowerCase());
}
