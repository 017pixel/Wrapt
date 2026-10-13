import { createServer, type Server } from "node:http";
import { once } from "node:events";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket, { WebSocketServer } from "ws";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const configuration = vi.hoisted(() => ({ codeServerPort: 0, codeServerLegacyPort: 0, editorBackend: "code-server" }));
vi.mock("../config/settings.js", () => ({ settings: configuration }));

let upstream: Server;
let app: ReturnType<typeof Fastify>;
let upstreamSockets: WebSocketServer;
let proxyOrigin: string;
let upstreamConnections = 0;

beforeAll(async () => {
  upstream = createServer((request, response) => {
    if (request.url?.includes("/callback")) {
      response.writeHead(200, { "content-type": "text/html", "content-security-policy": "script-src 'nonce-editor'; frame-ancestors 'self'" });
      response.end("<!doctype html><title>Editor callback</title>");
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ url: request.url, headers: request.headers }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("Test-Port fehlt.");
  configuration.codeServerPort = address.port;
  configuration.codeServerLegacyPort = address.port;
  upstreamSockets = new WebSocketServer({ server: upstream });
  upstreamSockets.on("connection", (socket, request) => {
    upstreamConnections += 1;
    socket.send(JSON.stringify({ url: request.url, headers: request.headers }));
    socket.on("message", (data, binary) => socket.send(data, { binary }));
  });
  const { registerEditorProxy } = await import("./editorProxy.js");
  app = Fastify({ trustProxy: ["127.0.0.1", "::1"] });
  await app.register(websocket);
  await registerEditorProxy(app);
  await app.ready();
  proxyOrigin = await app.listen({ host: "127.0.0.1", port: 0 });
});

afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve, reject) => upstreamSockets?.close((error) => error ? reject(error) : resolve()));
  await new Promise<void>((resolve, reject) => upstream?.close((error) => error ? reject(error) : resolve()));
});

describe("Editor-Proxy und Anmeldung", () => {
  it("normalisiert /editor mit vollständiger Query für relative Assets und Rücksprünge", async () => {
    const response = await app.inject("/editor?folder=%2Ftmp%2Fa%20b&workspace=demo");
    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe("/editor/?folder=%2Ftmp%2Fa%20b&workspace=demo");
  });

  it("behält Host, Präfix und das Protokoll einer lokalen HTTP-Instanz", async () => {
    const response = await app.inject({ url: "/editor/?folder=%2Ftmp", headers: { host: "localhost:19310" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ url: "/?folder=%2Ftmp", headers: {
      host: "localhost:19310", "x-forwarded-host": "localhost:19310", "x-forwarded-prefix": "/editor", "x-forwarded-proto": "http",
    } });
  });

  it("behält HTTPS hinter dem vertrauenswürdigen Reverse-Proxy", async () => {
    const response = await app.inject({ url: "/editor/healthz", remoteAddress: "127.0.0.1", headers: {
      host: "wrapt.example:8443", "x-forwarded-proto": "https",
    } });
    expect(response.json().headers["x-forwarded-proto"]).toBe("https");
  });

  it("leitet versionsgebundene Anmelde-Callbacks samt Query und CSP unverändert weiter", async () => {
    const response = await app.inject("/editor/stable-test/callback?vscode-reqid=2&vscode-authority=vscode.github-authentication");
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Editor callback");
    expect(response.headers["content-security-policy"]).toBe("script-src 'nonce-editor'; frame-ancestors 'self'");
  });

  it("erhält den vollständigen Pfad für VS Code serve-web mit /editor als Basispfad", async () => {
    configuration.editorBackend = "vscode";
    try {
      const response = await app.inject("/editor/stable-test/mint-key?windowId=2");
      expect(response.json().url).toBe("/editor/stable-test/mint-key?windowId=2");
    } finally { configuration.editorBackend = "code-server"; }
  });

  it("erhält alte code-server-Proxy-URLs trotz getrenntem offiziellen Editor-Port", async () => {
    const nativePort = configuration.codeServerPort;
    configuration.codeServerPort = 1;
    configuration.editorBackend = "vscode";
    try {
      for (const path of ["absproxy/1234/", "proxy/1234/"]) {
        const response = await app.inject(`/editor/${path}?demo=1`);
        expect(response.statusCode).toBe(200);
        expect(response.json().url).toBe(`/${path}?demo=1`);
      }
    } finally { configuration.codeServerPort = nativePort; configuration.editorBackend = "code-server"; }
  });

  it.each([
    { backend: "code-server", upstreamPath: "/stable-test/socket?windowId=2" },
    { backend: "vscode", upstreamPath: "/editor/stable-test/socket?windowId=2" },
    { backend: "vscode", upstreamPath: "/absproxy/1234/socket?windowId=2", proxyPath: "/editor/absproxy/1234/socket?windowId=2" },
  ])("erhält Pfad, Sitzungsheader und Text-/Binärframes im $backend-WebSocket", async ({ backend, upstreamPath, proxyPath }) => {
    configuration.editorBackend = backend;
    const socket = new WebSocket(`${proxyOrigin.replace(/^http/, "ws")}${proxyPath ?? "/editor/stable-test/socket?windowId=2"}`, "editor-protocol", {
      headers: { origin: proxyOrigin, cookie: "editor-session=test-session" },
    });
    try {
      const metadata = once(socket, "message");
      await once(socket, "open");
      const [rawMetadata] = await metadata;
      expect(JSON.parse(rawMetadata.toString())).toMatchObject({
        url: upstreamPath,
        headers: {
          host: new URL(proxyOrigin).host,
          "x-forwarded-host": new URL(proxyOrigin).host,
          "x-forwarded-prefix": "/editor",
          "x-forwarded-proto": "http",
          origin: proxyOrigin,
          cookie: "editor-session=test-session",
          "sec-websocket-protocol": "editor-protocol",
        },
      });
      const textReply = once(socket, "message");
      socket.send("Editor-Nachricht");
      const [textData, textBinary] = await textReply;
      expect(textData.toString()).toBe("Editor-Nachricht");
      expect(textBinary).toBe(false);
      const binaryReply = once(socket, "message");
      socket.send(Buffer.from([0, 1, 255]), { binary: true });
      const [binaryData, binaryFlag] = await binaryReply;
      expect(binaryData).toEqual(Buffer.from([0, 1, 255]));
      expect(binaryFlag).toBe(true);
    } finally {
      configuration.editorBackend = "code-server";
      if (socket.readyState === WebSocket.OPEN) {
        const closed = once(socket, "close");
        socket.close();
        await closed;
      } else { socket.terminate(); }
    }
  });

  it("verweigert fremde Origins vor der Verbindung zum Editor", async () => {
    const connectionCount = upstreamConnections;
    const socket = new WebSocket(`${proxyOrigin.replace(/^http/, "ws")}/editor/socket`, {
      headers: { origin: "https://fremd.example" },
    });
    const [code] = await once(socket, "close");
    expect(code).toBe(1008);
    expect(upstreamConnections).toBe(connectionCount);
  });
});
