import { createServer, type Server } from "node:http";

/** Eigene Werkzeug-Upstreams: Sie laufen durch die echten HTML-Proxys. */
export async function startShortcutFixtures(port: number): Promise<Server[]> {
  const servers: Server[] = [];
  try {
    for (const [offset, label] of [[1, "T3-Eingabe"], [4, "Editor-Eingabe"]] as const) {
      const server = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/html", "content-security-policy": offset === 1 ? "script-src 'unsafe-inline'; frame-ancestors 'self'" : "script-src 'nonce-shortcut-fixture'; frame-ancestors 'self'" });
        response.end(`<!doctype html><html><head><meta id="vscode-workbench-web-configuration" data-settings="{}"><script nonce="shortcut-fixture">
          window.receivedKeys = [];
          window.addEventListener('keydown', (event) => { window.receivedKeys.push(event.code); }, true);
        </script></head><body><label>${label}<textarea aria-label="${label}"></textarea></label></body></html>`);
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port + offset, "127.0.0.1", resolve);
      });
      servers.push(server);
    }
    return servers;
  } catch (error) {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    throw error;
  }
}
export async function stopShortcutFixtures(servers: Server[]) {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
}
