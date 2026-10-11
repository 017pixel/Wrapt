import { lookup as dnsLookup } from "node:dns";
import { promises as dnsPromises } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { FastifyReply, FastifyRequest } from "fastify";
import { settings } from "../config/settings.js";
import { isPublicAddress } from "../security/public-http.js";
import { AppError } from "../utils/errors.js";

export type ProxyAddressResolution = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultResolveAll: ProxyAddressResolution = (hostname) =>
  dnsPromises.lookup(hostname, { all: true, verbatim: true });

/**
 * Prüft ein Proxy-Ziel gegen DNS-Rebinding (S-012).
 *
 * IP-Literale können sich nicht umbiegen — für sie trägt allein die
 * Origin-Allowlist (der Aufrufer prüft sie vor jedem Hop erneut). DNS-Namen
 * werden beim ersten Sehen gepinnt; löst derselbe Name innerhalb einer
 * Redirect-Kette unterschiedlich auf, bricht der Proxy mit 403 ab, statt der
 * zweiten Adresse zu folgen. `allowPrivate` gilt nur für bereits allowlistete
 * Origins (z. B. Tailscale-DNS mit 100.x) — die Allowlist bleibt der
 * Vertrauensanker, das Pinning verhindert nur das Umbiegen danach.
 */
export async function checkProxyRedirectTarget(
  target: URL,
  pins: Map<string, string[]>,
  resolveAll: ProxyAddressResolution,
  allowPrivate = false,
): Promise<void> {
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return;
  const addresses = (await resolveAll(hostname)).map((entry) => entry.address);
  if (addresses.length === 0 || (!allowPrivate && addresses.some((address) => !isPublicAddress(address)))) {
    throw new AppError(403, "PROXY_DNS_BLOCKED", "Das DNS-Ziel verweist auf eine private oder reservierte Adresse.");
  }
  const key = hostname.toLowerCase();
  const sorted = [...addresses].sort();
  const pinned = pins.get(key);
  if (pinned && (pinned.length !== sorted.length || pinned.some((address, index) => address !== sorted[index]))) {
    throw new AppError(403, "PROXY_REBINDING_BLOCKED", "Das DNS-Ziel hat sich während der Weiterleitung verändert.");
  }
  if (!pinned) pins.set(key, sorted);
}

type PinningResolver = (
  hostname: string,
  options: { all: true; verbatim: true },
  callback: (error: Error | null, addresses: Array<{ address: string; family: number }>) => void,
) => void;

/**
 * Lookup für den Fetch-Agent: dieselbe Pin-Logik auf Socket-Ebene, damit auch
 * die tatsächliche Verbindung keiner umgebogenen Adresse folgt. Unbekannte
 * Namen werden wie im Vorab-Check behandelt (Allowlist-Kontext entscheidet
 * über `allowPrivate`).
 */
export function createPinningLookup(
  pins: Map<string, string[]>,
  allowPrivate: boolean,
  resolve: PinningResolver = dnsLookup,
): LookupFunction {
  return ((hostname: string, options: Parameters<LookupFunction>[1], callback: Parameters<LookupFunction>[2]) => {
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      const fail = (reason: Error) => {
        if (options.all) callback(reason, []);
        else callback(reason, "", 0);
      };
      if (error) {
        fail(error);
        return;
      }
      if (addresses.length === 0 || (!allowPrivate && addresses.some(({ address }) => !isPublicAddress(address)))) {
        fail(new Error("DNS-Ziel verweist auf eine private oder reservierte Adresse."));
        return;
      }
      const key = hostname.toLowerCase();
      const sorted = addresses.map(({ address }) => address).sort();
      const pinned = pins.get(key);
      if (pinned && (pinned.length !== sorted.length || pinned.some((address, index) => address !== sorted[index]))) {
        fail(new Error("DNS-Ziel hat sich während der Weiterleitung verändert."));
        return;
      }
      if (!pinned) pins.set(key, sorted);
      const selected = addresses[0]!;
      if (options.all) callback(null, [selected]);
      else callback(null, selected.address, selected.family);
    });
  }) as LookupFunction;
}

export function createProxyHandler(
  allowedOrigins: string[],
  options?: { resolveAll?: ProxyAddressResolution },
) {
  const allowedOriginSet = new Set(allowedOrigins);
  const resolveAll = options?.resolveAll ?? defaultResolveAll;
  return async function proxyHandler(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as Record<string, string>;
    const encoded = params["*"] ?? "";
    let target: URL;
    try {
      target = new URL(decodeURIComponent(encoded));
    } catch {
      throw new AppError(400, "INVALID_TARGET", "Ungültiges Proxy-Ziel.");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new AppError(400, "INVALID_TARGET", "Nur http(s) Ziele sind erlaubt.");
    }
    if (!allowedOrigins.includes(target.origin)) {
      throw new AppError(403, "PROXY_FORBIDDEN", "Diese Origin ist nicht für den Proxy freigegeben.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.proxyTimeoutMilliseconds);
    // Pins gelten pro Request-Kette (Startziel + Redirects) und werden vom
    // Vorab-Check und vom Socket-Lookup gemeinsam genutzt.
    const pins = new Map<string, string[]>();
    const agent = new Agent({ connect: { lookup: createPinningLookup(pins, true) } });
    try {
      let current = target;
      let upstream: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        if (!allowedOriginSet.has(current.origin)) {
          throw new AppError(403, "PROXY_REDIRECT_FORBIDDEN", "Die Weiterleitung verlässt die freigegebene Origin.");
        }
        // IP-Recheck nach jedem Redirect: Die Allowlist allein schützt nicht
        // vor Rebinding eines freigegebenen DNS-Namens auf Loopback/Link-Local.
        await checkProxyRedirectTarget(current, pins, resolveAll, true);
        // S-012: Fetch und Agent stammen aus demselben undici-Paket. Der
        // globale Fetch versteht auf Node 22 den v8-Dispatcher nicht
        // ("invalid onRequestStart method") — mit undiciFetch passt das Paar
        // auf jeder Node-Version zusammen.
        upstream = (await undiciFetch(current.href, {
          method: "GET",
          headers: { accept: request.headers.accept ?? "*/*" },
          redirect: "manual",
          signal: controller.signal,
          dispatcher: agent,
        })) as unknown as Response;
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
        const location = upstream.headers.get("location");
        await upstream.body?.cancel();
        if (!location) break;
        if (redirects === 5) throw new Error("Zu viele Weiterleitungen.");
        current = new URL(location, current);
      }
      if (!upstream) throw new Error("Keine Upstream-Antwort.");
      reply.status(upstream.status);
      const contentType = upstream.headers.get("content-type") ?? "";
      if (contentType) reply.header("content-type", contentType);
      for (const header of [
        "content-encoding",
        "content-length",
        "transfer-encoding",
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "content-disposition",
        "set-cookie",
      ]) {
        reply.removeHeader(header);
      }
      reply.header("cache-control", "no-store");

      const body = upstream.body;
      if (contentType.toLowerCase().includes("text/html")) {
        await body?.cancel();
        reply
          .header("content-security-policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
          .header("x-content-type-options", "nosniff");
        throw new AppError(
          415,
          "PROXY_HTML_BLOCKED",
          "Aktive HTML-Inhalte werden aus Sicherheitsgründen nicht über diesen Proxy ausgeliefert.",
        );
      }
      return reply.send(body);
    } catch (error) {
      if (error instanceof AppError) throw error;
      request.log.error({ err: error }, "Proxy-Fehler");
      throw new AppError(502, "PROXY_ERROR", "Die Upstream-Anfrage ist fehlgeschlagen.", null, true);
    } finally {
      clearTimeout(timeout);
      await agent.close().catch(() => undefined);
    }
  };
}
