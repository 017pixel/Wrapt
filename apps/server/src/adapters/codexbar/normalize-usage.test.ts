import { describe, expect, it } from "vitest";
import { normalizeProviderUsage } from "./normalize-usage.js";

describe("normalizeProviderUsage", () => {
  it("keeps the configured account email and stable limit fields", () => {
    const usage = normalizeProviderUsage("codex", [
      {
        provider: "codex",
        account: "name@example.com",
        source: "oauth",
        usage: {
          accountEmail: "name@example.com",
          loginMethod: "plus",
          updatedAt: "2026-07-12T14:00:00Z",
          primary: { usedPercent: 61, windowMinutes: 300, resetsAt: "2026-07-12T15:00:00Z" },
          secondary: { usedPercent: 12, windowMinutes: 10080, resetsAt: "2026-07-18T15:00:00Z" },
        },
      },
    ]);

    expect(usage).toMatchObject({
      providerId: "codex",
      status: "available",
      accounts: [{ label: "Account", email: "name@example.com", plan: "plus" }],
    });
    expect(usage.accounts[0]?.windows).toEqual([
      expect.objectContaining({ id: "primary", usedPercent: 61, remainingPercent: 39 }),
      expect.objectContaining({ id: "secondary", usedPercent: 12, remainingPercent: 88 }),
    ]);
    expect(JSON.stringify(usage)).toContain("name@example.com");
  });

  it("does not invent OpenCode Go data when CodexBar returns no usage", () => {
    const usage = normalizeProviderUsage("opencode", [
      { provider: "opencodego", source: "local", error: { code: 1, message: "No data" } },
    ]);

    expect(usage).toEqual({
      providerId: "opencode",
      providerName: "OpenCode Go",
      status: "unavailable",
      updatedAt: null,
      accounts: [],
      error: { code: "PROVIDER_UNAVAILABLE", message: "Für diesen Anbieter konnten keine Nutzungsdaten geladen werden." },
    });
  });

  it("labels the OpenCode Go 30-day window as a monthly limit", () => {
    const usage = normalizeProviderUsage("opencode", [
      {
        provider: "opencodego",
        source: "local",
        usage: {
          tertiary: { usedPercent: 37, windowMinutes: 43_200, resetsAt: "2026-08-02T08:24:29Z" },
        },
      },
    ]);

    expect(usage.accounts[0]?.windows).toEqual([
      expect.objectContaining({ label: "Monatslimit", remainingPercent: 63 }),
    ]);
  });

  it("keeps the usable account when CodexBar also returns a duplicate failed profile", () => {
    const usage = normalizeProviderUsage("codex", [
      { provider: "codex", source: "oauth", account: "name@example.com", usage: { accountEmail: "name@example.com", secondary: { usedPercent: 28, windowMinutes: 10_080 } } },
      { provider: "codex", source: "auto", account: "name@example.com", usage: { accountEmail: "name@example.com" }, error: { code: 1, message: "token invalidated" } },
    ]);
    expect(usage.accounts).toEqual([expect.objectContaining({ email: "name@example.com", windows: [expect.objectContaining({ remainingPercent: 72 })] })]);
    expect(usage).toMatchObject({ status: "available", error: null });
  });

  it("keeps independently authenticated Codex accounts and their limits", () => {
    const usage = normalizeProviderUsage("codex", [
      { provider: "codex", source: "oauth", account: "main@example.com", usage: { accountEmail: "main@example.com", primary: { usedPercent: 20, windowMinutes: 300 } } },
      { provider: "codex", source: "oauth", account: "work@example.com", usage: { accountEmail: "work@example.com", secondary: { usedPercent: 35, windowMinutes: 10_080 } } },
    ]);

    expect(usage.accounts).toEqual([
      expect.objectContaining({ email: "main@example.com", windows: [expect.objectContaining({ remainingPercent: 80 })] }),
      expect.objectContaining({ email: "work@example.com", windows: [expect.objectContaining({ remainingPercent: 65 })] }),
    ]);
  });

  it("normalizes Claude Code limits and the detected Pro account", () => {
    const usage = normalizeProviderUsage("claude", [{
      provider: "claude",
      source: "oauth",
      usage: {
        accountEmail: "claude@example.com",
        loginMethod: "Claude Pro",
        updatedAt: "2026-07-22T07:35:45Z",
        primary: { usedPercent: 25, windowMinutes: 300, resetsAt: "2026-07-22T12:30:00Z" },
        secondary: { usedPercent: 40, windowMinutes: 10_080, resetsAt: "2026-07-25T15:00:00Z" },
      },
    }]);

    expect(usage).toMatchObject({
      providerId: "claude",
      providerName: "Claude Code",
      status: "available",
      accounts: [{ email: "claude@example.com", plan: "Claude Pro" }],
    });
    expect(usage.accounts[0]?.windows).toEqual([
      expect.objectContaining({ label: "5-Stunden-Limit", remainingPercent: 75 }),
      expect.objectContaining({ label: "Wochenlimit", remainingPercent: 60 }),
    ]);
  });

  it("maps Codex reset credits into the account contract", () => {
    const usage = normalizeProviderUsage("codex", [{
      provider: "codex",
      source: "oauth",
      usage: {
        accountEmail: "plus@example.com",
        loginMethod: "plus",
        updatedAt: "2026-10-05T13:50:45Z",
        secondary: { usedPercent: 42, windowMinutes: 10080, resetsAt: "2026-10-11T19:09:15Z" },
        codexResetCredits: {
          availableCount: 2,
          updatedAt: "2026-10-05T13:50:45Z",
          credits: [
            {
              id: "codex-reset-credit-v1-abc",
              title: "Full reset",
              description: "Thanks for using Codex!",
              status: "available",
              granted_at: "2026-09-22T18:45:39Z",
              expires_at: "2026-10-22T18:45:39Z",
            },
            {
              id: "codex-reset-credit-v1-def",
              title: "Full reset",
              description: "",
              status: "available",
              granted_at: "2026-09-29T19:30:34Z",
              expires_at: null,
            },
          ],
        },
      },
    }]);

    expect(usage.accounts[0]?.resetCredits).toEqual([
      {
        id: "codex-reset-credit-v1-abc",
        title: "Full reset",
        description: "Thanks for using Codex!",
        status: "available",
        grantedAt: "2026-09-22T18:45:39Z",
        expiresAt: "2026-10-22T18:45:39Z",
      },
      {
        id: "codex-reset-credit-v1-def",
        title: "Full reset",
        description: "",
        status: "available",
        grantedAt: "2026-09-29T19:30:34Z",
        expiresAt: null,
      },
    ]);
  });

  it("behält ein Konto, dessen Limitfenster fehlen, aber das Guthaben hat", () => {
    // Ohne diese Regel ginge das Konto verloren, weil `primary` bis
    // `tertiary` leer sind — der Nutzer sähe weder Limit noch Guthaben.
    const usage = normalizeProviderUsage("codex", [{
      provider: "codex",
      source: "oauth",
      usage: {
        accountEmail: "plus@example.com",
        loginMethod: "plus",
        updatedAt: "2026-10-05T13:50:45Z",
        primary: null,
        secondary: null,
        tertiary: null,
        codexResetCredits: {
          availableCount: 1,
          updatedAt: "2026-10-05T13:50:45Z",
          credits: [{
            id: "credit-1",
            title: "Full reset",
            description: "",
            status: "available",
            granted_at: "2026-10-01T10:00:00Z",
            expires_at: "2026-12-01T10:00:00Z",
          }],
        },
      },
    }]);

    // `partial` bleibt korrekt: Wenn Codex keine Fenster meldet, fehlen wirklich
    // Daten. Entscheidend ist, dass das Konto samt Guthaben erhalten bleibt.
    expect(usage.status).toBe("partial");
    expect(usage.accounts).toHaveLength(1);
    expect(usage.accounts[0]?.windows).toEqual([]);
    expect(usage.accounts[0]?.resetCredits).toHaveLength(1);
  });

  it("leaves reset credits empty for providers without banked resets", () => {
    const usage = normalizeProviderUsage("opencode", [{
      provider: "opencodego",
      source: "local",
      usage: {
        updatedAt: "2026-10-05T13:50:45Z",
        primary: { usedPercent: 48, windowMinutes: 43200, resetsAt: "2026-10-23T00:00:00Z" },
      },
    }]);

    expect(usage.accounts[0]?.resetCredits).toEqual([]);
  });
});
