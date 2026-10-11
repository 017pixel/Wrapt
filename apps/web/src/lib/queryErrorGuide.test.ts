// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ApiClientError } from "./apiClient/transport.js";
import { classifyQueryError, formatRequestId, queryErrorGuide } from "./queryErrorGuide";

describe("classifyQueryError", () => {
  it("erkennt Netzwerkfehler (Fetch-Abbruch, 5xx)", () => {
    expect(classifyQueryError(new TypeError("Failed to fetch"))).toBe("netzwerk");
    expect(classifyQueryError(new ApiClientError(503, "REQUEST_FAILED", "Die Wrapt-API ist momentan nicht erreichbar.", null, true))).toBe("netzwerk");
  });

  it("erkennt Timeouts (Abort, 504)", () => {
    const abort = Object.assign(new Error("Timeout exceeded"), { name: "AbortError" });
    expect(classifyQueryError(abort)).toBe("timeout");
    expect(classifyQueryError(new ApiClientError(504, "TIMEOUT", "Zeitüberschreitung", null, true))).toBe("timeout");
  });

  it("erkennt Validierungsfehler (Zod, 422)", () => {
    const zod = Object.assign(new Error("Invalid input"), { name: "ZodError" });
    expect(classifyQueryError(zod)).toBe("validierung");
    expect(classifyQueryError(new ApiClientError(422, "VALIDATION", "Antwort ungültig", null, false))).toBe("validierung");
  });

  it("erkennt Quarantäne", () => {
    expect(classifyQueryError(new Error("Der Reset konnte nicht verifiziert werden. Der Slot bleibt in Quarantäne."))).toBe("quarantaene");
    expect(classifyQueryError(new ApiClientError(409, "PREVIEW_SLOT_QUARANTINED", "Slot in Quarantäne", null, false))).toBe("quarantaene");
  });

  it("fällt auf unbekannt zurück", () => {
    expect(classifyQueryError(new Error("Etwas Seltsames"))).toBe("unbekannt");
  });
});

describe("queryErrorGuide", () => {
  it("liefert je Klasse Titel + Ursache + Aktion + Retry", () => {
    const netz = queryErrorGuide(new TypeError("Failed to fetch"), "Fallback");
    expect(netz.titel).toBe("Verbindung fehlgeschlagen");
    expect(netz.aktion).toContain("erneut");
    expect(netz.retryable).toBe(true);

    const quar = queryErrorGuide(new Error("Slot in Quarantäne gesperrt"), "Fallback");
    expect(quar.titel).toContain("Quarantäne");
    expect(quar.aktion).toContain("Diagnose");
    expect(quar.docsHinweis).toContain("preview.config.json");

    const zeit = queryErrorGuide(Object.assign(new Error("zu lange"), { name: "AbortError" }), "Fallback");
    expect(zeit.titel).toContain("zu lange gedauert");

    const valid = queryErrorGuide(Object.assign(new Error("falsch"), { name: "ZodError" }), "Fallback");
    expect(valid.titel).toContain("erwarteten Format");
    expect(valid.docsHinweis).toContain("preview.config.json");
  });

  it("reicht die Anfrage-ID durch (bei Meldung angeben)", () => {
    const guide = queryErrorGuide(
      new ApiClientError(500, "REQUEST_FAILED", "Interner Fehler", "req-123", true),
      "Fallback",
    );
    expect(guide.requestId).toBe("req-123");
    expect(formatRequestId(guide.requestId)).toContain("req-123");
    expect(formatRequestId(guide.requestId)).toContain("bei Meldung angeben");
    expect(formatRequestId(null)).toBeNull();
  });

  it("nutzt den Fallback ohne Fehlertext", () => {
    expect(queryErrorGuide(undefined, "Seriendaten fehlen").ursache).toBe("Seriendaten fehlen");
  });
});
