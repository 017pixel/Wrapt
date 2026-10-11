// Sammelt Absturzberichte im Frontend und bereitet sie so auf, dass man sie in einem
// Rutsch kopieren und einem KI-Agenten geben kann. Bewusst ohne externe Abhängigkeit:
// ein Ringpuffer für Breadcrumbs, ein Abonnement für die Anzeige, ein Textformatierer.

export type CrashKind = "render" | "error" | "unhandledrejection";

export interface CrashReport {
  id: string;
  occurredAt: string;
  kind: CrashKind;
  message: string;
  stack: string | null;
  componentStack: string | null;
  route: string;
  breadcrumbs: string[];
}

export interface CrashEnvironment {
  appVersion: string | null;
  bootId: string | null;
  webBuildId: number | null;
  backendReachable: boolean;
}

const BREADCRUMB_LIMIT = 50;

interface Breadcrumb {
  at: string;
  message: string;
  count: number;
}

const breadcrumbs: Breadcrumb[] = [];

/**
 * Schwärzt E-Mails und lokale Pfade, bevor etwas gespeichert oder versendet
 * wird (Q-004). Läuft über jede Breadcrumb und jeden Bericht — ein versehentlich
 * mitgeloggter Account (Usage) oder Pfad darf nie im Crash-Report landen.
 */
const emailMuster = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const pfadMuster = /(\/home\/|\/Users\/)[^\s"'`]+|[A-Za-z]:\\[^\s"'`]+/g;

export function redactText(text: string): string {
  return text.replace(emailMuster, "[E-Mail geschwärzt]").replace(pfadMuster, "[Pfad geschwärzt]");
}

/** Query-Schlüssel gekürzt + geschwärzt für den Verlauf (kein volles JSON). */
export function formatQueryErrorBreadcrumb(queryKey: unknown, error: unknown): string {
  let key: string;
  try {
    key = JSON.stringify(queryKey) ?? String(queryKey);
  } catch {
    key = String(queryKey);
  }
  if (key.length > 200) key = `${key.slice(0, 200)}…`;
  const message = error instanceof Error ? error.message : String(error);
  return `Query fehlgeschlagen [${redactText(key)}]: ${redactText(message)}`;
}

/**
 * Notiert einen Zwischenschritt (Seitenwechsel, API-Fehler, console.error) für den Bericht.
 * Wiederholungen werden zusammengefasst — sonst spült eine in Schleife feuernde Meldung
 * (etwa ein ResizeObserver) den gesamten nützlichen Verlauf aus dem Puffer.
 */
export function addBreadcrumb(message: string) {
  const redacted = redactText(message);
  const trimmed = redacted.length > 500 ? `${redacted.slice(0, 500)}…` : redacted;
  const last = breadcrumbs.at(-1);
  if (last && last.message === trimmed) {
    last.count += 1;
    return;
  }
  breadcrumbs.push({ at: new Date().toISOString(), message: trimmed, count: 1 });
  if (breadcrumbs.length > BREADCRUMB_LIMIT) breadcrumbs.shift();
}

function snapshotBreadcrumbs(): string[] {
  return breadcrumbs.map(({ at, message, count }) => `${at} ${message}${count > 1 ? ` (${count}×)` : ""}`);
}

/** Nur für Tests: setzt den Ringpuffer zurück. */
export function resetBreadcrumbsForTest() {
  breadcrumbs.length = 0;
}

/** Die letzten bis zu 50 Schritte für das manuelle Kopieren per Schnellaktion. */
export function getRecentSteps(): string[] {
  return snapshotBreadcrumbs();
}

/** Beschreibt ein geklicktes Element kurz für das Schritte-Protokoll. */
export function describeClickTarget(target: Element | null): string | null {
  if (!target) return null;
  const labelled = target.closest<HTMLElement>(
    "button, a, [role=button], [role=menuitem], [role=tab], input, select, textarea, summary",
  );
  if (!labelled) return null;
  const label = (labelled.getAttribute("aria-label")
    ?? labelled.textContent
    ?? labelled.getAttribute("placeholder")
    ?? labelled.tagName).trim().replace(/\s+/g, " ");
  if (!label) return null;
  const shortened = label.length > 80 ? `${label.slice(0, 80)}…` : label;
  return redactText(`Klick: <${labelled.tagName.toLowerCase()}> ${shortened}`);
}

type Listener = (report: CrashReport | null) => void;

const listeners = new Set<Listener>();
let currentReport: CrashReport | null = null;

export function subscribeToCrash(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrentCrash(): CrashReport | null {
  return currentReport;
}

export function dismissCrash() {
  currentReport = null;
  for (const listener of listeners) listener(null);
}

// Q-002 Schwere-Stufen: Abgelehnte Promises (Hintergrund-500, abgebrochene
// Mutationen, Preview-Saves) sind kein Vollbild wert — sie werden Breadcrumb
// plus Toast. Nur Render- und echte Error-Fehler öffnen den Dialog.
export interface CrashToast {
  id: string;
  message: string;
}

type ToastListener = (toast: CrashToast | null) => void;

const toastListeners = new Set<ToastListener>();
let currentToast: CrashToast | null = null;

export function subscribeToCrashToast(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export function getCurrentToast(): CrashToast | null {
  return currentToast;
}

export function dismissToast() {
  currentToast = null;
  for (const listener of toastListeners) listener(null);
}

/** Nur für Tests: setzt den Toast-Zustand zurück. */
export function resetToastForTest() {
  currentToast = null;
}

function pushToast(message: string) {
  const short = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  currentToast = {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    message: redactText(short),
  };
  for (const listener of toastListeners) listener(currentToast);
}

// Defensiv gelesen: Ein Berichtsgenerator, der selbst am fehlenden DOM scheitert,
// verschluckt genau den Fehler, den er melden soll.
function currentRoute(): string {
  const location = globalThis.location;
  return location ? `${location.pathname}${location.search}` : "unbekannt";
}

function describe(value: unknown): { message: string; stack: string | null } {
  if (value instanceof Error) return { message: `${value.name}: ${value.message}`, stack: value.stack ?? null };
  if (typeof value === "string") return { message: value, stack: null };
  try {
    return { message: JSON.stringify(value) ?? String(value), stack: null };
  } catch {
    return { message: String(value), stack: null };
  }
}

// Meldungen, die der Browser über window.onerror schickt, obwohl nichts kaputt ist.
// Sie tragen keine verwertbare Information — ein Pop-Up dafür wäre nur Lärm, der den
// Blick auf echte Abstürze verstellt. Sie landen stattdessen im Verlauf.
const benignMessages = [
  // Laut Resize-Observer-Spezifikation harmlos: Der Browser konnte nicht alle
  // Benachrichtigungen im selben Frame zustellen und holt das im nächsten nach.
  // @xyflow/react im Orbit löst das beim Zoomen und Verschieben regelmäßig aus.
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
];

const isAbortError = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "name" in value &&
  (value as { name?: unknown }).name === "AbortError";

/**
 * Entscheidet, ob eine Meldung einen Bericht wert ist. Bewusst eng gehalten: Was hier
 * durchrutscht, sieht der Nutzer nie — die Liste darf nur nachweislich Harmloses enthalten.
 */
export function isBenignError(kind: CrashKind, error: unknown, message: string): boolean {
  if (benignMessages.some((entry) => message.includes(entry))) return true;
  // Cross-Origin-Skripte melden nur "Script error." — ohne Stack, Datei oder Zeile.
  // Daraus lässt sich kein Bericht bauen, mit dem jemand etwas anfangen kann.
  if (kind === "error" && /^Script error\.?$/.test(message.trim())) return true;
  // Abgebrochene Anfragen sind Normalbetrieb: React bricht laufende fetches beim
  // Verlassen einer Ansicht ab, das ist kein Fehlerfall.
  if (isAbortError(error)) return true;
  return false;
}

/**
 * Meldet einen Absturz. Nur Render- und Error-Fehler öffnen den Vollbild-Dialog;
 * Promise-Ablehnungen landen als Breadcrumb + Toast (Q-002). Der erste Bericht
 * gewinnt: Folgefehler sind meistens Nachbeben des ersten.
 */
export function reportCrash(input: { kind: CrashKind; error: unknown; componentStack?: string | null }) {
  const { message, stack } = describe(input.error);
  if (isBenignError(input.kind, input.error, message)) {
    addBreadcrumb(`Ignoriert (harmlos): ${message}`);
    return;
  }
  if (input.kind === "unhandledrejection") {
    addBreadcrumb(`Abgelehntes Promise: ${message}`);
    pushToast(message);
    return;
  }
  if (currentReport) return;
  currentReport = {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    occurredAt: new Date().toISOString(),
    kind: input.kind,
    message: redactText(message),
    stack: stack ? redactText(stack) : null,
    componentStack: input.componentStack ? redactText(input.componentStack) : null,
    route: currentRoute(),
    breadcrumbs: snapshotBreadcrumbs(),
  };
  for (const listener of listeners) listener(currentReport);
}

const kindLabels: Record<CrashKind, string> = {
  render: "React-Renderfehler",
  error: "Unbehandelter Fehler",
  unhandledrejection: "Nicht abgefangenes Promise",
};

/** Der kopierbare Bericht — Kontext zuerst, dann eine klare Arbeitsanweisung für den Agenten. */
export function formatCrashReport(report: CrashReport, environment: CrashEnvironment): string {
  const lines = [
    "# Crash-Report — Wrapt",
    "",
    `- Zeitpunkt: ${report.occurredAt}`,
    `- Art: ${kindLabels[report.kind]} (${report.kind})`,
    `- Route: ${report.route}`,
    `- App-Version: ${environment.appVersion ?? "unbekannt"}`,
    `- Backend erreichbar: ${environment.backendReachable ? "ja" : "nein"}`,
    `- bootId: ${environment.bootId ?? "unbekannt"}`,
    `- webBuildId: ${environment.webBuildId ?? "unbekannt"}`,
    `- User-Agent: ${globalThis.navigator?.userAgent ?? "unbekannt"}`,
    `- Viewport: ${globalThis.innerWidth ?? "?"}x${globalThis.innerHeight ?? "?"}`,
    "",
    "## Fehlermeldung",
    "",
    "```",
    report.message,
    "```",
  ];

  if (report.stack) lines.push("", "## Stacktrace", "", "```", report.stack, "```");
  if (report.componentStack) lines.push("", "## React-Komponentenbaum", "", "```", report.componentStack.trim(), "```");
  if (report.breadcrumbs.length) lines.push("", "## Verlauf vor dem Absturz", "", "```", ...report.breadcrumbs, "```");

  lines.push(
    "",
    "## Auftrag an den KI-Agenten",
    "",
    "Du arbeitest im Wrapt-Repository (pnpm-Monorepo: `apps/server` Fastify,",
    "`apps/web` React/Vite, `packages/contracts` Zod). Bitte:",
    "",
    "1. Finde anhand von Stacktrace und Komponentenbaum die auslösende Stelle im Quellcode.",
    "2. Erkläre kurz die Ursache — nicht nur das Symptom.",
    "3. Behebe die Ursache und achte auf gleichartige Stellen im Projekt.",
    "4. Prüfe mit `pnpm typecheck` (nach Schema-Änderungen zuerst",
    "   `pnpm --filter @wrapt/contracts build`) und mit `pnpm test`.",
    "5. Baue neu und starte neu: `bash scripts/restart-all.sh`.",
    "",
    "Antworte auf Deutsch.",
  );

  return lines.join("\n");
}

/** Das manuell kopierte Schritte-Protokoll — gleiche Form wie der Crash-Report. */
export function formatStepsReport(steps: readonly string[], environment: CrashEnvironment): string {
  const lines = [
    "# Schritte-Protokoll — Wrapt",
    "",
    `- Zeitpunkt: ${new Date().toISOString()}`,
    `- Route: ${currentRoute()}`,
    `- App-Version: ${environment.appVersion ?? "unbekannt"}`,
    `- Backend erreichbar: ${environment.backendReachable ? "ja" : "nein"}`,
    `- bootId: ${environment.bootId ?? "unbekannt"}`,
    `- webBuildId: ${environment.webBuildId ?? "unbekannt"}`,
    `- User-Agent: ${globalThis.navigator?.userAgent ?? "unbekannt"}`,
    `- Viewport: ${globalThis.innerWidth ?? "?"}x${globalThis.innerHeight ?? "?"}`,
    "",
    "## Letzte Schritte (bis zu 50)",
    "",
    "```",
    ...(steps.length ? steps : ["(noch keine Schritte aufgezeichnet)"]),
    "```",
    "",
    "## Auftrag an den KI-Agenten",
    "",
    "Du arbeitest im Wrapt-Repository (pnpm-Monorepo: `apps/server` Fastify,",
    "`apps/web` React/Vite, `packages/contracts` Zod). Der Nutzer hat diese Schritte",
    "kurz vor einem Fehler oder einer Auffälligkeit kopiert. Bitte:",
    "",
    "1. Nutze das Protokoll, um den Ablauf bis zur Auffälligkeit nachzuvollziehen.",
    "2. Finde die auslösende Stelle im Quellcode und erkläre kurz die Ursache.",
    "3. Behebe die Ursache und achte auf gleichartige Stellen im Projekt.",
    "4. Prüfe mit `pnpm typecheck` (nach Schema-Änderungen zuerst",
    "   `pnpm --filter @wrapt/contracts build`) und mit `pnpm test`.",
    "",
    "Antworte auf Deutsch.",
  ];

  return lines.join("\n");
}

let installed = false;

/**
 * Hängt sich an die globalen Fehlerkanäle. Ohne das verschwinden Fehler außerhalb des
 * React-Renderings (Event-Handler, Promises) stillschweigend in der Konsole.
 */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    // Fehlgeschlagene Bild-/Skript-Downloads sind keine Abstürze — nur notieren.
    if (event.target && event.target !== window) {
      const element = event.target as Partial<HTMLElement> & { src?: string; href?: string };
      addBreadcrumb(`Ressource nicht geladen: ${element.src ?? element.href ?? element.tagName ?? "unbekannt"}`);
      return;
    }
    reportCrash({ kind: "error", error: event.error ?? event.message });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    reportCrash({ kind: "unhandledrejection", error: event.reason });
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    addBreadcrumb(`console.error: ${args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" ")}`);
    originalConsoleError(...args);
  };
}
