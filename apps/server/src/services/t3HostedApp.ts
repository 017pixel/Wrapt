import type { T3Channel } from "@wrapt/contracts";
import type { ServiceConfig } from "../config/schemas.js";

export const T3_HOSTED_APP_ORIGINS: Record<T3Channel, string> = {
  stable: "https://app.t3.codes",
  nightly: "https://nightly.app.t3.codes",
};

const officialOrigins = new Set(Object.values(T3_HOSTED_APP_ORIGINS));

/**
 * Die offizielle Hosted-App hat getrennte Stable- und Nightly-Deployments.
 * Eigene T3-Endpunkte bleiben unverändert, damit bestehende Installationen
 * hinter Tailscale oder einer eigenen Domain abwärtskompatibel bleiben.
 */
export function resolveT3HostedAppUrl(url: string | null, channel: T3Channel): string | null {
  if (url === null) return null;
  const parsed = new URL(url);
  if (!officialOrigins.has(parsed.origin)) return url;

  const targetOrigin = T3_HOSTED_APP_ORIGINS[channel];
  if (parsed.origin === targetOrigin) return url;
  const target = new URL(targetOrigin);
  parsed.protocol = target.protocol;
  parsed.host = target.host;
  return parsed.toString();
}

export function resolveT3ServiceUrls(services: ServiceConfig[], channel: T3Channel): ServiceConfig[] {
  return services.map((service) => service.id === "t3-code"
    ? { ...service, publicUrl: resolveT3HostedAppUrl(service.publicUrl, channel) }
    : service);
}
