import { describe, expect, it } from "vitest";
import { ApiClientError } from "./apiClient/transport";
import { queryPollingInterval, queryRetryDelay, retryQuery } from "./queryPolicy";

describe("Abfragewiederholungen", () => {
  it.each([400, 401, 403, 404, 409, 422])("wiederholt HTTP %i nicht automatisch", (status) => {
    const error = new ApiClientError(status, "FAILED", "Fehler");
    expect(retryQuery(0, error)).toBe(false);
    expect(queryPollingInterval(3_000)({ state: { error, fetchFailureCount: 1 } })).toBe(false);
  });
  it("begrenzt Netzwerkwiederholungen und verlängert das Polling", () => {
    const error = new TypeError("Failed to fetch");
    expect(retryQuery(0, error)).toBe(true);
    expect(retryQuery(2, error)).toBe(false);
    expect(queryRetryDelay(1)).toBeGreaterThan(queryRetryDelay(0));
    expect(queryPollingInterval(3_000)({ state: { error, fetchFailureCount: 2 } })).toBe(12_000);
    expect(queryPollingInterval(3_000)({ state: { error: null, fetchFailureCount: 0 } })).toBe(3_000);
  });
});
