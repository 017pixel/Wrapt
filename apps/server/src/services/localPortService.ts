import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readlink } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { execa } from "execa";
import { localPortsResponseSchema, type LocalPort, type LocalPortsResponse } from "@wrapt/contracts";

interface ListeningSocket {
  address: string;
  port: number;
  process: string | null;
  pid: number | null;
}

export interface LocalPortCommandResult {
  exitCode: number | null;
  stdout: string;
}

export type LocalPortCommandRunner = (file: string, args: string[]) => Promise<LocalPortCommandResult>;

function parseEndpoint(value: string): { address: string; port: number } | null {
  const bracketed = /^\[(?<address>.*)]:(?<port>\d+)$/.exec(value);
  const plain = /^(?<address>.*):(?<port>\d+)$/.exec(value);
  const match = bracketed ?? plain;
  const port = Number(match?.groups?.port);
  if (!match?.groups?.address || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return { address: match.groups.address, port };
}

export function parseListeningSockets(output: string): ListeningSocket[] {
  const sockets: ListeningSocket[] = [];
  for (const line of output.split("\n")) {
    const columns = line.trim().split(/\s+/);
    const endpoint = parseEndpoint(columns[3] ?? "");
    if (!endpoint) continue;
    const processMatch = /users:\(\("(?<name>[^"]+)",pid=(?<pid>\d+)/.exec(line);
    sockets.push({ ...endpoint, process: processMatch?.groups?.name ?? null, pid: processMatch?.groups?.pid ? Number(processMatch.groups.pid) : null });
  }
  return deduplicateSockets(sockets, ["127.0.0.1"]).sort((a, b) => a.port - b.port);
}

export function parseLsofListeningSockets(output: string): ListeningSocket[] {
  const sockets: ListeningSocket[] = [];
  for (const line of output.split("\n")) {
    const listening = /\bTCP\s+(?<endpoint>\S+)\s+\(LISTEN\)\s*$/.exec(line.trim());
    const endpoint = listening?.groups?.endpoint ? parseEndpoint(listening.groups.endpoint) : null;
    if (!endpoint) continue;
    const columns = line.trim().split(/\s+/);
    const pid = Number(columns[1]);
    sockets.push({
      ...endpoint,
      process: columns[0] || null,
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    });
  }
  return deduplicateSockets(sockets, ["127.0.0.1", "::1"]).sort((a, b) => a.port - b.port);
}

export function parseLsofCurrentDirectory(output: string): string | null {
  const entry = output.split("\n").find((line) => line.startsWith("n"));
  return entry && entry.length > 1 ? entry.slice(1) : null;
}

export function listeningSocketCommand(platform: NodeJS.Platform): { file: string; args: string[] } | null {
  if (platform === "darwin") return { file: "lsof", args: ["-nP", "-iTCP", "-sTCP:LISTEN"] };
  if (platform === "linux") return { file: "ss", args: ["-H", "-ltnp"] };
  return null;
}

export function processCwdCommand(platform: NodeJS.Platform, pid: number): { file: string; args: string[] } | null {
  if (platform === "darwin") return { file: "lsof", args: ["-p", String(pid), "-a", "-d", "cwd", "-Fn"] };
  return null;
}

function deduplicateSockets(entries: ListeningSocket[], preferredAddresses: readonly string[]): ListeningSocket[] {
  const sockets = new Map<number, ListeningSocket>();
  for (const candidate of entries) {
    const current = sockets.get(candidate.port);
    const candidateIsPreferred = preferredAddresses.includes(candidate.address);
    const currentIsPreferred = current ? preferredAddresses.includes(current.address) : false;
    if (!current || (!currentIsPreferred && candidateIsPreferred)) sockets.set(candidate.port, candidate);
  }
  return [...sockets.values()];
}

// Hintergrunddienste des Betriebssystems und der Workbench selbst. Sie sind nie
// ein Preview-Ziel und würden die Auswahl nur zumüllen.
const systemProcessNames = new Set([
  "avahi-daemon", "chrome", "chromium", "chromium-browse", "chronyd", "codexbar", "colord", "containerd",
  "cups-browsed", "cupsd", "dnsmasq", "dockerd", "exim4", "fwupd", "gdm3", "master", "memcached",
  "ModemManager", "mongod", "mysqld", "NetworkManager", "nmbd", "ntpd", "packagekitd", "postgres",
  "redis-server", "rpcbind", "smbd", "snapd", "sshd", "systemd-resolve", "systemd-resolved",
  "tailscaled", "udisksd",
]);

// Privilegierte Ports gehören auf einem Entwicklungsrechner dem System
// (SSH, DNS, Drucker, Mail). Projekt-Devserver binden oberhalb von 1024.
const lowestProjectPort = 1_024;

export function isProjectSocket(socket: ListeningSocket, excludedProcessNames: ReadonlySet<string> = systemProcessNames): boolean {
  if (socket.port < lowestProjectPort) return false;
  return !socket.process || !excludedProcessNames.has(socket.process);
}

export function isAllowedProjectPort(port: number, allowedPorts?: ReadonlySet<number>): boolean {
  return allowedPorts === undefined || allowedPorts.has(port);
}

function probe(port: number, protocol: "http" | "https", timeoutMilliseconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    const request = (protocol === "https" ? httpsRequest : httpRequest)({
      hostname: "127.0.0.1",
      port,
      method: "HEAD",
      path: "/",
      timeout: timeoutMilliseconds,
      rejectUnauthorized: false,
      headers: { Connection: "close", "User-Agent": "Dev-Workbench-Port-Scanner" },
    }, (response) => {
      response.resume();
      resolve(true);
    });
    request.once("timeout", () => { request.destroy(); resolve(false); });
    request.once("error", () => resolve(false));
    request.end();
  });
}

function contained(root: string, target: string): boolean {
  const path = relative(resolve(root), resolve(target));
  return path === "" || (!path.startsWith("..") && !path.includes("/../"));
}

async function resolvePort(
  socket: ListeningSocket,
  timeoutMilliseconds: number,
  projects: ReadonlyArray<{ id: string; name: string; path: string }>,
  platform: NodeJS.Platform,
  commandRunner: LocalPortCommandRunner,
): Promise<LocalPort> {
  const isHttp = await probe(socket.port, "http", timeoutMilliseconds);
  const isHttps = isHttp ? false : await probe(socket.port, "https", timeoutMilliseconds);
  const protocol = isHttp ? "http" as const : isHttps ? "https" as const : "unknown" as const;
  let project: { id: string; name: string; path: string } | undefined;
  if (socket.pid !== null) {
    try {
      let cwd: string | null;
      if (platform === "darwin") {
        const command = processCwdCommand(platform, socket.pid);
        if (!command) return toLocalPort(socket, protocol, null);
        const result = await commandRunner(command.file, command.args).catch(() => ({ exitCode: null, stdout: "" }));
        cwd = result.exitCode === 0 ? parseLsofCurrentDirectory(result.stdout) : null;
      } else {
        cwd = await readlink(`/proc/${socket.pid}/cwd`);
      }
      if (!cwd) return toLocalPort(socket, protocol, null);
      project = [...projects]
        .filter((candidate) => contained(candidate.path, cwd))
        .sort((left, right) => right.path.length - left.path.length)[0];
    } catch {
      // Prozesse anderer Benutzer oder bereits beendete Prozesse bleiben ohne Projektzuordnung sichtbar.
    }
  }
  return toLocalPort(socket, protocol, project ?? null);
}

function toLocalPort(
  socket: ListeningSocket,
  protocol: LocalPort["protocol"],
  project: { id: string; name: string; path: string } | null,
): LocalPort {
  return {
    ...socket,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    protocol,
    localUrl: protocol === "unknown" ? null : `${protocol}://127.0.0.1:${socket.port}/`,
    proxyUrl: null,
  };
}

export function createLocalPortService(options: {
  cacheMilliseconds: number;
  probeTimeoutMilliseconds: number;
  allowedPorts?: readonly number[];
  excludedPorts?: readonly number[];
  excludedProcessNames?: readonly string[];
  projects?: () => Promise<ReadonlyArray<{ id: string; name: string; path: string }>>;
  platform?: NodeJS.Platform;
  commandRunner?: LocalPortCommandRunner;
}) {
  let cached: LocalPortsResponse | null = null;
  let cachedAt = 0;
  let inFlight: Promise<LocalPortsResponse> | null = null;

  const allowedPorts = options.allowedPorts === undefined ? undefined : new Set(options.allowedPorts);
  const excluded = new Set(options.excludedPorts ?? []);
  const excludedProcessNames = options.excludedProcessNames ? new Set(options.excludedProcessNames) : systemProcessNames;
  const platform = options.platform ?? process.platform;
  const commandRunner: LocalPortCommandRunner = options.commandRunner ?? (async (file, args) => {
    const result = await execa(file, args, { reject: false, shell: false, timeout: 2_000 });
    return { exitCode: result.exitCode ?? null, stdout: result.stdout };
  });

  const scan = async (): Promise<LocalPortsResponse> => {
    const command = listeningSocketCommand(platform);
    const result = !command
      ? { exitCode: null, stdout: "" }
      : platform === "darwin"
        ? await commandRunner(command.file, command.args).catch(() => ({ exitCode: null, stdout: "" }))
        : await commandRunner(command.file, command.args);
    const parsed = result.exitCode === 0
      ? platform === "darwin" ? parseLsofListeningSockets(result.stdout) : parseListeningSockets(result.stdout)
      : [];
    const sockets = parsed.filter((socket) => isAllowedProjectPort(socket.port, allowedPorts) && !excluded.has(socket.port) && isProjectSocket(socket, excludedProcessNames));
    const projects = await options.projects?.().catch(() => []) ?? [];
    const resolved = await Promise.all(sockets.map((socket) => resolvePort(socket, options.probeTimeoutMilliseconds, projects, platform, commandRunner)));
    // Ohne HTTP-Antwort lässt sich nichts als Preview öffnen – solche Ports
    // gehören zu Hilfsdiensten und bleiben ausgeblendet.
    const ports = resolved.filter((port) => port.protocol !== "unknown");
    return localPortsResponseSchema.parse({ ports, scannedAt: new Date().toISOString() });
  };

  return {
    async list(force = false): Promise<LocalPortsResponse> {
      if (!force && cached && Date.now() - cachedAt < options.cacheMilliseconds) return cached;
      if (!inFlight) {
        inFlight = scan().then((response) => {
          cached = response;
          cachedAt = Date.now();
          return response;
        }).finally(() => { inFlight = null; });
      }
      return inFlight;
    },
  };
}
