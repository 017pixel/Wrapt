import { describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import {
  assertSlotAccess,
  cookieDomainWarnings,
  deriveSlotToken,
  devServerDownPage,
  externalRedirectWarnPage,
  externalRedirectWarnUrl,
  extractSlotToken,
  isExternalRedirectTarget,
  sanitizeSlotCookies,
  EXTERNAL_REDIRECT_WARN_ROUTE,
} from "./gateway-auth.js";
import type { SlotRoute } from "./routing.js";

const secret = "test-geheimnis";
const sessionId = "00000000-0000-4000-8000-000000000001";

function route(): SlotRoute {
  return {
    slotId: 1, targetPort: 5173, targetProtocol: "http", role: "primary", label: "Hauptdienst",
    sessionId, storageProfileId: null, state: "active", mapping: {}, primaryTarget: null,
  };
}

function expectAppError(fn: () => void, status: number, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(status);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Kein AppError ${code} geworfen.`);
}

describe("Slot-Token (S-005)", () => {
  it("leitet pro Session ein unerratbares Token ab", () => {
    const first = deriveSlotToken(secret, sessionId);
    expect(first).toHaveLength(64);
    expect(deriveSlotToken(secret, sessionId)).toBe(first);
    expect(deriveSlotToken(secret, "andere-session")).not.toBe(first);
    expect(deriveSlotToken("anderes-geheimnis", sessionId)).not.toBe(first);
  });

  it("liest das Token aus Query oder Header", () => {
    expect(extractSlotToken("/?slotToken=abc", {})).toBe("abc");
    expect(extractSlotToken("/?a=1&slotToken=abc&b=2", {})).toBe("abc");
    expect(extractSlotToken("/?token=abc", {})).toBeNull();
    expect(extractSlotToken("/", { "x-preview-slot-token": "hdr" })).toBe("hdr");
  });

  it("weist Fremde ohne Token im strikten Modus mit 403 ab", () => {
    expectAppError(
      () => assertSlotAccess(route(), "/", {}, { secret, requireToken: true }),
      403, "PREVIEW_SLOT_TOKEN_REQUIRED",
    );
  });

  it("weist ein falsches Token immer mit 403 ab, auch ohne strikten Modus", () => {
    expectAppError(
      () => assertSlotAccess(route(), "/?slotToken=falsch", {}, { secret }),
      403, "PREVIEW_SLOT_TOKEN_INVALID",
    );
  });

  it("lässt das gültige Token passieren und Routen ohne Session unangetastet", () => {
    const token = deriveSlotToken(secret, sessionId);
    expect(() => assertSlotAccess(route(), `/?slotToken=${token}`, {}, { secret, requireToken: true })).not.toThrow();
    expect(() => assertSlotAccess({ ...route(), sessionId: null }, "/", {}, { secret, requireToken: true })).not.toThrow();
  });
});

describe("Cookie-Fail-Closed (S-005)", () => {
  it("meldet hostweite Cookies wie bisher", () => {
    expect(cookieDomainWarnings(["sid=abc; Path=/; Domain=localhost", "theme=dark; Path=/"])).toEqual(["sid"]);
  });

  it("entfernt Domain=localhost-Cookies statt sie durchzureichen", () => {
    const result = sanitizeSlotCookies(["sid=abc; Path=/; Domain=localhost", "theme=dark; Path=/"]);
    expect(result.kept).toEqual(["theme=dark; Path=/"]);
    expect(result.removed).toEqual(["sid"]);
    const single = sanitizeSlotCookies("sid=abc; Path=/; Domain=127.0.0.1");
    expect(single.kept).toBeUndefined();
    expect(single.removed).toEqual(["sid"]);
  });

  it("lässt normale Cookies unverändert", () => {
    expect(sanitizeSlotCookies("theme=dark; Path=/")).toEqual({ kept: "theme=dark; Path=/", removed: [] });
    expect(sanitizeSlotCookies(undefined)).toEqual({ kept: undefined, removed: [] });
  });
});

describe("Extern-Redirect-Warnung (S-012)", () => {
  const mapping = { "5173": "https://server.test:8451/" };

  it("erkennt nur echte externe Ziele", () => {
    expect(isExternalRedirectTarget("https://evil.example/phish", mapping)).toBe(true);
    expect(isExternalRedirectTarget("https://server.test:8451/intern", mapping)).toBe(false);
    expect(isExternalRedirectTarget("http://localhost:5173/api", mapping)).toBe(false);
    expect(isExternalRedirectTarget("/relativ", mapping)).toBe(false);
    expect(isExternalRedirectTarget("kein-url", mapping)).toBe(false);
  });

  it("baut eine Warn-URL mit escaptem Ziel", () => {
    const url = externalRedirectWarnUrl("https://evil.example/?a=<script>");
    expect(url.startsWith(EXTERNAL_REDIRECT_WARN_ROUTE)).toBe(true);
    const page = externalRedirectWarnPage("https://evil.example/?a=<script>");
    expect(page).toContain("Trotzdem öffnen");
    expect(page).not.toContain("<script>");
  });

  it("behält die 502-Selbstheilungsseite bei", () => {
    expect(devServerDownPage()).toContain("wrapt:preview-retry");
  });
});
