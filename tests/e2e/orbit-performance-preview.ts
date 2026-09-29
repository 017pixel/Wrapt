import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { PERF_FIXTURE, PERF_HEADERS } from "./orbit-performance-support";

const iframeSelector = ".orbit-preview-slot .preview-slot-frame iframe";
const sentinelKey = "wrapt:orbit-perf-sentinel";
const sentinelValue = "same-slot-storage-survived";

interface SessionObservation {
  id: string;
  sessionKey: string;
  slotId: number;
  targetPort: number;
}

interface FrameSnapshot {
  activeIds: number[];
  mountEvents: Array<{ id: number; at: number }>;
  unmountEvents: Array<{ id: number; at: number }>;
  navigationEvents: Array<{ id: number; at: number; source: string }>;
}

export interface PreviewRouteSample {
  from: string;
  to: string;
  durationMs: number;
  sessionId: string;
  sessionKey: string;
  slotId: number;
  ownSlotCount: number;
  ownActiveSlotCount: number;
  slotStatusVerified: boolean;
  activeIframeIds: number[];
  iframeCount: number;
  mountCount: number;
  unmountCount: number;
  navigationCount: number;
  iframeNavigations: Array<{ id: number; at: number; source: string }>;
  sameIframeIdentity: boolean;
  sameIframeElementAsInitial: boolean;
  sameSession: boolean;
  sameSlot: boolean;
  oneActiveSlot: boolean;
  sentinelPreserved: boolean | null;
}

export interface PreviewRouteMatrix {
  warmupCycles: number;
  cycles: number;
  samples: PreviewRouteSample[];
  sessionId: string;
  sessionKey: string;
  slotId: number;
  gateFindings: string[];
}

export async function installPreviewLifecycleAudit(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const known = new WeakMap<HTMLIFrameElement, number>();
    let nextId = 0;
    let active = new Set<number>();
    const mounts: FrameSnapshot["mountEvents"] = [];
    const unmounts: FrameSnapshot["unmountEvents"] = [];
    const navigations: FrameSnapshot["navigationEvents"] = [];
    const lastSource = new WeakMap<HTMLIFrameElement, string>();
    const scan = () => {
      const current = new Map<number, HTMLIFrameElement>();
      for (const frame of document.querySelectorAll<HTMLIFrameElement>(".orbit-preview-slot .preview-slot-frame iframe")) {
        let id = known.get(frame);
        if (id === undefined) {
          id = ++nextId;
          known.set(frame, id);
          frame.addEventListener("load", () => navigations.push({ id: id!, at: performance.now(), source: frame.src }));
        }
        current.set(id, frame);
        if (!active.has(id)) mounts.push({ id, at: performance.now() });
        const source = frame.getAttribute("src") ?? "";
        if (lastSource.has(frame) && lastSource.get(frame) !== source) navigations.push({ id, at: performance.now(), source });
        lastSource.set(frame, source);
      }
      for (const id of active) if (!current.has(id)) unmounts.push({ id, at: performance.now() });
      active = new Set(current.keys());
    };
    Object.defineProperty(window, "__orbitPreviewAudit", {
      value: { snapshot: () => { scan(); return { activeIds: [...active], mountEvents: [...mounts], unmountEvents: [...unmounts], navigationEvents: [...navigations] }; } },
    });
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    requestAnimationFrame(scan);
  });
}

export function observePreviewSessions(page: Page) {
  const keys = new Set<string>();
  const sessions: SessionObservation[] = [];
  const pending: Promise<void>[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).pathname !== "/api/v1/previews/sessions") return;
    try {
      const body = request.postDataJSON() as { sessionKey?: string };
      if (body.sessionKey) keys.add(body.sessionKey);
    } catch { /* Ein fehlerhafter Body wird vom API-Fehler sichtbar gemacht. */ }
  });
  page.on("response", (response) => {
    if (response.request().method() !== "POST" || new URL(response.url()).pathname !== "/api/v1/previews/sessions") return;
    const capture = response.json().then((body: { id: string; sessionKey: string; bindings: Array<{ role: string; slotId: number; targetPort: number }> }) => {
      const binding = body.bindings.find((item) => item.role === "primary");
      if (response.ok() && binding) sessions.push({ id: body.id, sessionKey: body.sessionKey, slotId: binding.slotId, targetPort: binding.targetPort });
    }).catch(() => undefined);
    pending.push(capture);
  });
  return {
    keys,
    sessions,
    async flush() { await Promise.all(pending.splice(0)); },
  };
}

async function frameSnapshot(page: Page): Promise<FrameSnapshot> {
  return page.evaluate(() => (window as typeof window & { __orbitPreviewAudit: { snapshot: () => FrameSnapshot } }).__orbitPreviewAudit.snapshot());
}

async function slotSnapshot(request: APIRequestContext, origin: string) {
  const response = await request.get(new URL("/api/v1/previews/slots", origin).toString(), { headers: PERF_HEADERS });
  if (!response.ok()) throw new Error(`Preview-Slotstatus konnte nicht gelesen werden (${response.status()}).`);
  const result = await response.json() as { slots: Array<{ id: number; targetPort: number | null; storageProfileId: string | null; affinityStatus: string; state: string }> };
  const own = result.slots.filter((slot) => slot.targetPort === PERF_FIXTURE.previewPort
    && slot.storageProfileId === PERF_FIXTURE.previewStorageProfileId && slot.affinityStatus === "own");
  return { ownSlots: own, active: own.filter((slot) => slot.state === "active") };
}

export async function measurePreviewRouteMatrix(
  page: Page,
  request: APIRequestContext,
  origin: string,
  observer: ReturnType<typeof observePreviewSessions>,
): Promise<PreviewRouteMatrix> {
  await observer.flush();
  const initialSession = observer.sessions.at(-1);
  if (!initialSession) throw new Error("Die isolierte Orbit-Preview hat keine Session-Antwort geliefert.");
  const initialSlots = await slotSnapshot(request, origin);
  let lastVerifiedSlots = initialSlots;
  const gateFindings: string[] = [];
  if (initialSlots.active.length !== 1 || initialSlots.active[0]?.id !== initialSession.slotId) {
    gateFindings.push(`Erster Fixture-Slotstatus stimmt nicht mit Slot ${initialSession.slotId} der Session überein.`);
  }
  const initialFrames = await frameSnapshot(page);
  const initialFrameId = initialFrames.activeIds[0] ?? null;
  const initialNavigationCount = initialFrames.navigationEvents.length;
  const firstFrame = page.frameLocator(iframeSelector);
  await firstFrame.locator("html").evaluate((element, payload) => {
    if (element.tagName !== "HTML") throw new Error("Die Preview-Fixture besitzt kein HTML-Dokument.");
    localStorage.setItem(payload.key, payload.value);
  }, { key: sentinelKey, value: sentinelValue });

  const samples: PreviewRouteSample[] = [];
  const transition = async (from: string, to: string, navigate: () => Promise<void>) => {
    const before = await frameSnapshot(page);
    const started = performance.now();
    await navigate();
    const durationMs = Number((performance.now() - started).toFixed(2));
    await observer.flush();
    const session = observer.sessions.at(-1) ?? initialSession;
    const slotStatusVerified = to === "orbit-node";
    if (slotStatusVerified) lastVerifiedSlots = await slotSnapshot(request, origin);
    const slots = lastVerifiedSlots;
    const after = await frameSnapshot(page);
    const sentinelPreserved = to === "orbit-node"
      ? await page.frameLocator(iframeSelector).locator("html").evaluate((element, payload) =>
        document.documentElement === element && localStorage.getItem(payload.key) === payload.value,
      { key: sentinelKey, value: sentinelValue })
      : null;
    const sameSession = session.id === initialSession.id;
    const sameSlot = session.slotId === initialSession.slotId;
    const oneActiveSlot = slots.active.length === 1 && slots.active[0]?.id === initialSession.slotId;
    const sameIframeElementAsInitial = initialFrameId !== null && after.activeIds.includes(initialFrameId);
    if (!sameSession) gateFindings.push(`${from} → ${to}: Session-ID wechselte von ${initialSession.id} zu ${session.id}.`);
    if (!sameSlot) gateFindings.push(`${from} → ${to}: Slot-ID wechselte von ${initialSession.slotId} zu ${session.slotId}.`);
    if (slotStatusVerified && !oneActiveSlot) gateFindings.push(`${from} → ${to}: erwartet wurde ein aktiver Fixture-Slot ${initialSession.slotId}, vorhanden sind ${slots.active.map((slot) => slot.id).join(", ") || "keine"}.`);
    if (initialFrameId !== null && !sameIframeElementAsInitial) gateFindings.push(`${from} → ${to}: iframe-Element ${initialFrameId} blieb nicht im DOM erhalten.`);
    if (after.navigationEvents.length > initialNavigationCount) gateFindings.push(`${from} → ${to}: iframe-Navigation trat erneut auf.`);
    if (sentinelPreserved === false) gateFindings.push(`${from} → ${to}: Preview-localStorage-Sentinel ging verloren.`);
    samples.push({
      from, to, durationMs,
      sessionId: session.id,
      sessionKey: session.sessionKey,
      slotId: session.slotId,
      ownSlotCount: slots.ownSlots.length,
      ownActiveSlotCount: slots.active.length,
      slotStatusVerified,
      activeIframeIds: after.activeIds,
      iframeCount: after.activeIds.length,
      mountCount: after.mountEvents.length - before.mountEvents.length,
      unmountCount: after.unmountEvents.length - before.unmountEvents.length,
      navigationCount: after.navigationEvents.length - before.navigationEvents.length,
      iframeNavigations: after.navigationEvents.slice(before.navigationEvents.length),
      sameIframeIdentity: before.activeIds.length === 1 && after.activeIds.length === 1 && before.activeIds[0] === after.activeIds[0],
      sameIframeElementAsInitial,
      sameSession,
      sameSlot,
      oneActiveSlot,
      sentinelPreserved,
    });
  };

  const orbitPreviewButton = page.getByRole("button", { name: "Preview-Verwaltung öffnen" });
  const previewsLink = page.locator('a[data-navigation-id="wrapt.previews.navigation.main"]');
  const orbitLink = page.locator('a[data-navigation-id="wrapt.orbit.navigation.main"]');
  const toPreviewPage = async () => {
    await orbitPreviewButton.click();
    const activePreviewHub = page.locator(".persistent-route.is-active .preview-hub");
    await expect(activePreviewHub).toBeVisible();
    await expect(activePreviewHub.locator(".preview-hub-runtime")).toBeVisible();
  };
  const toStandalonePreviews = async () => {
    await previewsLink.click();
    await expect(page.locator(".persistent-route.is-active .preview-hub")).toBeVisible();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/wrapt/previews");
  };
  const toOrbitNode = async () => {
    await orbitLink.click();
    // The cold-open path already checks the full canvas, iframe count and SPA readiness.
    // Warm returns only need to prove that the persistent Orbit surface and its iframe returned.
    await expect(page.locator(".orbit-page")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(iframeSelector)).toHaveCount(1, { timeout: 5_000 });
  };
  await toPreviewPage();
  await toStandalonePreviews();
  await toOrbitNode();
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await transition("orbit-node", "orbit-preview-page", toPreviewPage);
    await transition("orbit-preview-page", "previews", toStandalonePreviews);
    await transition("previews", "orbit-node", toOrbitNode);
  }
  return { warmupCycles: 1, cycles: 10, samples, sessionId: initialSession.id, sessionKey: initialSession.sessionKey, slotId: initialSession.slotId, gateFindings: [...new Set(gateFindings)] };
}
