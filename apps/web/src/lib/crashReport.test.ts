// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  addBreadcrumb,
  describeClickTarget,
  dismissCrash,
  formatStepsReport,
  getCurrentCrash,
  getRecentSteps,
  isBenignError,
  reportCrash,
  resetBreadcrumbsForTest,
} from "./crashReport";

beforeEach(() => {
  dismissCrash();
  resetBreadcrumbsForTest();
});

describe("harmlose Browser-Meldungen", () => {
  // Diese Meldung tauchte im Orbit (@xyflow/react) auf und hat fälschlich das
  // Crash-Pop-Up geöffnet, obwohl laut Spezifikation nichts kaputt ist.
  it("stuft ResizeObserver-Meldungen nicht als Absturz ein", () => {
    const message = "ResizeObserver loop completed with undelivered notifications.";
    expect(isBenignError("error", message, message)).toBe(true);

    reportCrash({ kind: "error", error: message });
    expect(getCurrentCrash()).toBeNull();
  });

  it("ignoriert auch die ältere ResizeObserver-Variante", () => {
    const message = "ResizeObserver loop limit exceeded";
    expect(isBenignError("error", message, message)).toBe(true);
  });

  it("ignoriert inhaltslose Cross-Origin-Meldungen", () => {
    expect(isBenignError("error", null, "Script error.")).toBe(true);
    expect(isBenignError("error", null, "Script error")).toBe(true);
  });

  it("ignoriert abgebrochene Anfragen", () => {
    const abort = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    expect(isBenignError("unhandledrejection", abort, abort.message)).toBe(true);
  });

  it("hält echte Fehler weiterhin fest", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'name')");
    expect(isBenignError("error", error, error.message)).toBe(false);

    reportCrash({ kind: "error", error });
    expect(getCurrentCrash()?.message).toContain("Cannot read properties of undefined");
  });

  it("meldet einen Renderfehler auch dann, wenn der Text zufällig 'Script error' enthält", () => {
    const error = new Error("Script error handling in ToolPanel schlug fehl");
    expect(isBenignError("render", error, error.message)).toBe(false);
  });

  it("notiert Ignoriertes im Verlauf, damit es bei echten Abstürzen sichtbar bleibt", () => {
    reportCrash({ kind: "error", error: "ResizeObserver loop limit exceeded" });
    reportCrash({ kind: "error", error: new Error("Echter Fehler") });

    const crash = getCurrentCrash();
    expect(crash?.message).toContain("Echter Fehler");
    expect(crash?.breadcrumbs.join("\n")).toContain("Ignoriert (harmlos): ResizeObserver");
  });
});

describe("Verlauf", () => {
  it("fasst Wiederholungen zusammen, statt den Puffer zu fluten", () => {
    for (let index = 0; index < 40; index += 1) addBreadcrumb("Immer dieselbe Meldung");
    addBreadcrumb("Etwas anderes");

    reportCrash({ kind: "error", error: new Error("Ausloeser") });
    const breadcrumbs = getCurrentCrash()?.breadcrumbs ?? [];

    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toContain("(40×)");
    expect(breadcrumbs[1]).toContain("Etwas anderes");
  });

  it("behält nur die jüngsten Einträge", () => {
    for (let index = 0; index < 70; index += 1) addBreadcrumb(`Schritt ${index}`);

    reportCrash({ kind: "error", error: new Error("Ausloeser") });
    const breadcrumbs = getCurrentCrash()?.breadcrumbs ?? [];

    expect(breadcrumbs).toHaveLength(50);
    expect(breadcrumbs.at(-1)).toContain("Schritt 69");
    expect(breadcrumbs.at(0)).toContain("Schritt 20");
  });

  it("gibt die letzten 50 Schritte für das manuelle Protokoll zurück", () => {
    for (let index = 0; index < 60; index += 1) addBreadcrumb(`Aktion ${index}`);

    const steps = getRecentSteps();

    expect(steps).toHaveLength(50);
    expect(steps.at(-1)).toContain("Aktion 59");
    expect(steps.at(0)).toContain("Aktion 10");
  });

  it("formatiert ein kopierbares Schritte-Protokoll mit Arbeitsauftrag", () => {
    addBreadcrumb("Seitenwechsel: / → /projekte");
    addBreadcrumb("Klick: <button> Speichern");

    const text = formatStepsReport(getRecentSteps(), {
      appVersion: "1.6.0",
      bootId: "boot-123",
      webBuildId: 456,
      backendReachable: true,
    });

    expect(text).toContain("# Schritte-Protokoll — Wrapt");
    expect(text).toContain("Seitenwechsel: / → /projekte");
    expect(text).toContain("Auftrag an den KI-Agenten");
    expect(text).toContain("Antworte auf Deutsch.");
  });

  it("beschreibt Klickziele kurz und ohne Rauschen", () => {
    const button = document.createElement("button");
    button.textContent = "  Speichern   Entwurf  ";
    expect(describeClickTarget(button)).toBe("Klick: <button> Speichern Entwurf");
    expect(describeClickTarget(document.createElement("div"))).toBeNull();
    expect(describeClickTarget(null)).toBeNull();
  });
});
