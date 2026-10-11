import { ZodError } from "zod";
import type { HermesErrorCode } from "@wrapt/contracts";
import type { TerminalErrorCode } from "../terminal/protocol.js";
import { AppError } from "./errors.js";

/**
 * Zentrale Fehler-Taxonomie (D-013): Fachliche Fehlerklassen werden hier auf
 * HTTP-Status, API-Code und Retry-Hinweis abgebildet — einmal für den
 * HTTP-Pfad (`toApiError`, genutzt in `app/hooks.ts`) und einmal für den
 * Terminal-WebSocket (`toTerminalError`, genutzt in `terminal/routes.ts`).
 * Neue Fehlerklassen gehören hierher, nicht in verteilte `catch`-Blöcke.
 */

export interface MappedApiError {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown> | null;
  retryable: boolean;
  /** Nur echte Unbekannte werden als „unbehandelt" geloggt. */
  logAsUnhandled: boolean;
}

const TERMINAL_ERROR_CODES: ReadonlySet<string> = new Set<string>([
  "UNAUTHORIZED", "FORBIDDEN", "SESSION_NOT_FOUND", "SESSION_NOT_OWNED", "INVALID_CWD",
  "CWD_NOT_FOUND", "CWD_NOT_DIRECTORY", "PTY_SPAWN_FAILED", "PTY_WRITE_FAILED",
  "PTY_RESIZE_FAILED", "TERMINAL_NOT_RUNNING", "SESSION_INTERRUPTED", "SESSION_ALREADY_CLOSED",
  "SESSION_RUNTIME_CONFLICT", "TOO_MANY_SESSIONS", "INVALID_MESSAGE", "INTERNAL_ERROR",
  "CLI_NOT_FOUND",
]);

interface HermesLike {
  code: string;
  message: string;
  status: number | null;
  retryable: boolean;
}

function isHermesClientError(error: unknown): error is HermesLike {
  return error instanceof Error
    && error.name === "HermesClientError"
    && typeof (error as unknown as { code?: unknown }).code === "string";
}

interface TerminalLike {
  code: string;
  message: string;
}

function isTerminalFailure(error: unknown): error is TerminalLike {
  return error instanceof Error
    && error.name !== "HermesClientError"
    && typeof (error as unknown as { code?: unknown }).code === "string"
    && TERMINAL_ERROR_CODES.has((error as unknown as { code: string }).code);
}

function isSqliteBusy(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (code === "SQLITE_BUSY") return true;
  }
  return String(error).includes("SQLITE_BUSY");
}

/** Terminal-Fehlercode → HTTP-Status (teilt sich die Codewelt mit dem WS). */
export function terminalErrorToHttpStatus(code: TerminalErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN":
    case "SESSION_NOT_OWNED": return 403;
    case "SESSION_NOT_FOUND":
    case "CWD_NOT_FOUND": return 404;
    case "TOO_MANY_SESSIONS": return 429;
    case "SESSION_RUNTIME_CONFLICT": return 409;
    case "INTERNAL_ERROR": return 500;
    default: return 400;
  }
}

function hermesErrorToHttpStatus(code: string): number {
  switch (code as HermesErrorCode) {
    case "SESSION_NOT_FOUND":
    case "PROJECT_NOT_FOUND": return 404;
    case "PROJECT_FORBIDDEN": return 403;
    case "RATE_LIMITED": return 429;
    case "SESSION_BUSY":
    case "UPDATE_RUNNING":
    case "APPROVAL_EXPIRED": return 409;
    default: return 502;
  }
}

export function toApiError(error: unknown): MappedApiError {
  if (error instanceof AppError) {
    return { status: error.statusCode, code: error.code, message: error.message, details: error.details, retryable: error.retryable, logAsUnhandled: false };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Die Anfrage oder Konfiguration ist ungültig.",
      details: { issues: error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) },
      retryable: false,
      logAsUnhandled: false,
    };
  }
  if (isHermesClientError(error)) {
    const status = hermesErrorToHttpStatus(error.code);
    return {
      status,
      code: error.code,
      message: error.message || "Das Hermes-Dashboard konnte die Anfrage nicht verarbeiten.",
      details: error.status === null ? null : { upstreamStatus: error.status },
      retryable: error.retryable || status === 429 || status >= 500,
      logAsUnhandled: false,
    };
  }
  if (isTerminalFailure(error)) {
    const code = error.code as TerminalErrorCode;
    const status = terminalErrorToHttpStatus(code);
    return {
      status,
      code,
      message: error.message || "Die Terminalanfrage konnte nicht verarbeitet werden.",
      details: null,
      retryable: status === 429 || status >= 500,
      logAsUnhandled: false,
    };
  }
  if (isSqliteBusy(error)) {
    return {
      status: 503,
      code: "SQLITE_BUSY",
      message: "Die Datenbank ist gerade ausgelastet. Bitte kurz warten und erneut versuchen.",
      details: null,
      retryable: true,
      logAsUnhandled: false,
    };
  }
  if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 429) {
    return { status: 429, code: "RATE_LIMITED", message: "Zu viele Anfragen. Bitte kurz warten.", details: null, retryable: true, logAsUnhandled: false };
  }
  if (
    typeof error === "object"
    && error !== null
    && "statusCode" in error
    && typeof error.statusCode === "number"
    && error.statusCode >= 400
    && error.statusCode < 500
  ) {
    return { status: error.statusCode, code: "VALIDATION_ERROR", message: "Die Anfrage ist ungültig.", details: null, retryable: false, logAsUnhandled: false };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: "Die Anfrage konnte nicht verarbeitet werden.", details: null, retryable: true, logAsUnhandled: true };
}

/** WS-Gegenstück zu toApiError: meldet Terminal-Codes, alles andere generisch. */
export function toTerminalError(error: unknown): { code: TerminalErrorCode; message: string } {
  if (isTerminalFailure(error)) return { code: error.code as TerminalErrorCode, message: error.message };
  if (error instanceof ZodError) return { code: "INVALID_MESSAGE", message: "Die Terminalnachricht ist ungültig." };
  if (error instanceof AppError) {
    return { code: error.statusCode === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message: error.message };
  }
  return { code: "INTERNAL_ERROR", message: "Die Terminalanfrage konnte nicht verarbeitet werden." };
}
