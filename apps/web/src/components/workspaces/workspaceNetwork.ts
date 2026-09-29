import { normalizeWorkspaceUrl } from "./workspaceModel";

export function preconnectWorkspace(url: string): void {
  if (typeof document === "undefined") return;
  const origin = normalizeWorkspaceUrl(url);
  if (!origin) return;
  const host = new URL(origin).host;
  if (!document.head.querySelector(`link[rel="dns-prefetch"][href="//${host}"]`)) {
    const dnsPrefetch = document.createElement("link");
    dnsPrefetch.rel = "dns-prefetch";
    dnsPrefetch.href = `//${host}`;
    document.head.appendChild(dnsPrefetch);
  }
  if (!document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = origin;
    preconnect.crossOrigin = "anonymous";
    document.head.appendChild(preconnect);
  }
}
