import type { FastifyRequest } from "fastify";
import { isIP } from "node:net";
import { AppError } from "../utils/errors.js";
import { isSameOriginRequest } from "./same-origin.js";

export interface WorkbenchIdentityOptions {
  allowedUsers: readonly string[];
  adminUsers?: readonly string[];
  developmentUser?: string;
  localLoopbackTrust?: boolean;
  localUsername?: string;
}

const protectedPrefixes = [
  "/api/",
  "/editor",
  "/t3",
  "/opencode",
  "/hermes",
  "/assets/",
  "/.well-known/t3/",
  "/api/auth/",
];

// Der Preview-Doctor authentifiziert sich selbst über Loopback-Verbindung und
// Capability-Token; eine Tailscale-Identität darf ihn nicht vorab blockieren.
// Dasselbe gilt für den Open-in-Editor-Kanal: Das T3-`code`-Shim spricht
// ausschließlich über Loopback und ein eigenes Capability-Token.
const unprotectedApiPrefixes = [
  "/api/v1/previews/doctor/",
  "/api/v1/editor/",
];

// T3 authenticates its root WebSocket with its own session cookie or ticket.
// Browser WebSocket upgrades do not reliably carry the Tailscale identity
// header, so the upstream T3 service must receive and validate this request.
const protectedExactPaths = new Set([
  "/",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
]);

export function firstHeader(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
}

export function requestIdentity(request: FastifyRequest): string | undefined {
  const identity = firstHeader(request.headers["tailscale-user-login"])?.toLowerCase();
  return identity && identity.length > 0 ? identity : undefined;
}

function requestHeaderNames(request: FastifyRequest): string[] {
  const names = Object.keys(request.headers).map((name) => name.toLowerCase());
  const rawHeaders = request.raw.rawHeaders;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    names.push(rawHeaders[index]!.toLowerCase());
  }
  return names;
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (normalized === "::1") return true;
  return isIP(normalized) === 4 && normalized.startsWith("127.");
}

export function requestLocalLoopbackIdentity(request: FastifyRequest, options: WorkbenchIdentityOptions): string | undefined {
  if (!options.localLoopbackTrust) return undefined;
  const headers = requestHeaderNames(request);
  if (headers.includes("tailscale-user-login") || headers.some((name) => name.startsWith("x-forwarded-"))) return undefined;
  if (!isLoopbackAddress(request.raw.socket?.remoteAddress)) return undefined;
  const username = options.localUsername?.trim().toLowerCase();
  return username || undefined;
}

export function isWorkbenchUserAllowed(
  request: FastifyRequest,
  identity: string,
  options: WorkbenchIdentityOptions,
): boolean {
  if (requestLocalLoopbackIdentity(request, options) === identity) return true;
  return options.allowedUsers.length === 0 || options.allowedUsers.includes(identity);
}

export function resolveWorkbenchUser(
  request: FastifyRequest,
  options: WorkbenchIdentityOptions,
): string {
  const identity = requestIdentity(request) ?? requestLocalLoopbackIdentity(request, options) ?? options.developmentUser?.toLowerCase();
  if (!identity) {
    throw new AppError(
      401,
      "WRAPT_IDENTITY_REQUIRED",
      "Für diesen Bereich wird eine Tailscale-Identität benötigt.",
    );
  }
  if (!isWorkbenchUserAllowed(request, identity, options)) {
    throw new AppError(
      403,
      "WRAPT_FORBIDDEN",
      "Dieser Benutzer darf die Workbench nicht verwenden.",
    );
  }
  return identity;
}

export function requireWorkbenchAdmin(
  request: FastifyRequest,
  options: WorkbenchIdentityOptions,
): string {
  const identity = resolveWorkbenchUser(request, options);
  const adminUsers = options.adminUsers && options.adminUsers.length > 0
    ? options.adminUsers
    : options.allowedUsers.slice(0, 1);
  if (!adminUsers.includes(identity)) {
    throw new AppError(
      403,
      "WRAPT_ADMIN_REQUIRED",
      "Für diese Verwaltung muss die aktuelle Identität als Workbench-Administrator freigeschaltet sein.",
    );
  }
  return identity;
}

export function isProtectedWorkbenchRequest(request: FastifyRequest): boolean {
  const pathname = new URL(request.raw.url ?? request.url, "http://wrapt.local").pathname;
  if (pathname === "/api/v1/health") return false;
  if (unprotectedApiPrefixes.some((prefix) => pathname.startsWith(prefix))) return false;
  return protectedExactPaths.has(pathname) ||
    protectedPrefixes.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

export function requireMutationOrigin(request: FastifyRequest): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;

  const origin = firstHeader(request.headers.origin);
  const fetchSite = firstHeader(request.headers["sec-fetch-site"]);
  // CLI- und systemd-Aufrufe senden weder Origin noch Fetch-Metadata. Ein
  // Browser sendet bei mutierenden Fetches mindestens einen dieser Header.
  if (!origin && !fetchSite) return;
  if (fetchSite === "same-origin" && isSameOriginRequest(request)) return;
  if (isSameOriginRequest(request)) return;

  throw new AppError(
    403,
    "WRAPT_CROSS_ORIGIN",
    "Diese Aktion ist nur aus der Workbench-Oberfläche erlaubt.",
  );
}
