import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TerminalFailure } from "../terminal/session.js";
import { AppError } from "./errors.js";
import { toApiError, toTerminalError } from "./api-errors.js";

/** HermesClientError ohne dessen Modul (zieht Settings-Seiteneffekte). */
function hermesError(code: string, message: string, status: number | null, retryable: boolean): Error {
  const error = new Error(message) as Error & { code: string; status: number | null; retryable: boolean };
  error.name = "HermesClientError";
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  return error;
}

describe("toApiError", () => {
  it("reicht AppError mit Status, Code und Retry-Hinweis durch", () => {
    expect(toApiError(new AppError(404, "NOTE_NOT_FOUND", "Fehlt"))).toMatchObject({
      status: 404, code: "NOTE_NOT_FOUND", retryable: false, logAsUnhandled: false,
    });
    expect(toApiError(new AppError(409, "NOTE_REVISION_CONFLICT", "Konflikt"))).toMatchObject({
      status: 409, code: "NOTE_REVISION_CONFLICT", retryable: false,
    });
  });

  it("mappt Hermes-Fehler auf Status, Code und Retry-Hinweis", () => {
    expect(toApiError(hermesError("SESSION_NOT_FOUND", "Sitzung weg", 404, false))).toMatchObject({
      status: 404, code: "SESSION_NOT_FOUND", retryable: false,
    });
    expect(toApiError(hermesError("RATE_LIMITED", "Zu viele", 429, false))).toMatchObject({
      status: 429, code: "RATE_LIMITED", retryable: true,
    });
    expect(toApiError(hermesError("DASHBOARD_UNREACHABLE", "Down", null, true))).toMatchObject({
      status: 502, code: "DASHBOARD_UNREACHABLE", retryable: true,
    });
  });

  it("mappt Terminal-Fehler statt anonymem 500", () => {
    expect(toApiError(new TerminalFailure("SESSION_NOT_FOUND", "Weg"))).toMatchObject({
      status: 404, code: "SESSION_NOT_FOUND", retryable: false,
    });
    expect(toApiError(new TerminalFailure("TOO_MANY_SESSIONS", "Voll"))).toMatchObject({
      status: 429, code: "TOO_MANY_SESSIONS", retryable: true,
    });
    expect(toApiError(new TerminalFailure("SESSION_RUNTIME_CONFLICT", "Belegt"))).toMatchObject({
      status: 409, code: "SESSION_RUNTIME_CONFLICT",
    });
    expect(toApiError(new TerminalFailure("FORBIDDEN", "Nein"))).toMatchObject({ status: 403 });
  });

  it("mappt SQLITE_BUSY auf 503 mit Retry-Hinweis", () => {
    const busy = Object.assign(new Error("SQLITE_BUSY: database is locked"), { code: "SQLITE_BUSY" });
    expect(toApiError(busy)).toMatchObject({ status: 503, code: "SQLITE_BUSY", retryable: true, logAsUnhandled: false });
  });

  it("mappt Zod-Fehler auf 400 ohne Retry", () => {
    let zod: unknown;
    try {
      z.string().parse(123);
    } catch (error) {
      zod = error;
    }
    expect(toApiError(zod)).toMatchObject({ status: 400, code: "VALIDATION_ERROR", retryable: false });
  });

  it("meldet Unbekanntes als 500 mit Retry und Log-Kennzeichen", () => {
    expect(toApiError(new Error("boom"))).toMatchObject({
      status: 500, code: "INTERNAL_ERROR", retryable: true, logAsUnhandled: true,
    });
  });
});

describe("toTerminalError", () => {
  it("reicht Terminal-Codes an den WebSocket durch", () => {
    expect(toTerminalError(new TerminalFailure("SESSION_NOT_FOUND", "Weg"))).toEqual({
      code: "SESSION_NOT_FOUND", message: "Weg",
    });
  });

  it("meldet Fremdfehler generisch", () => {
    expect(toTerminalError(new Error("boom"))).toEqual({
      code: "INTERNAL_ERROR", message: "Die Terminalanfrage konnte nicht verarbeitet werden.",
    });
  });
});
