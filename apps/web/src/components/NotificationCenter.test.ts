// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { Notification } from "@wrapt/contracts";
import { selectVisibleToasts, shouldToastNotification, toastIdentity } from "./NotificationCenter";

function entry(id: string, source: Notification["source"], overrides: Partial<Notification> = {}) {
  const item = notification(id, source, overrides);
  return { identity: `${item.id}:${item.createdAt}`, notification: item, leaving: false };
}

function notification(id: string, source: Notification["source"], overrides: Partial<Notification> = {}): Notification {
  return {
    id, source, category: "coding-agent", sourceIcon: "t3", kind: "agent.completed",
    severity: "success", state: "active", title: "Fertig", body: "fertig",
    link: null, remoteId: null, createdAt: new Date().toISOString(),
    readAt: null, acknowledgedAt: null, deletedAt: null, resolvedAt: null,
    meta: {}, report: null,
    ...overrides,
  } as Notification;
}

describe("selectVisibleToasts", () => {
  it("zeigt standardmäßig genau einen Toast, der neueste gewinnt", () => {
    const visible = selectVisibleToasts([entry("alt-1", "t3"), entry("alt-2", "t3"), entry("neu", "t3")]);
    expect(visible.map((item) => item.notification.id)).toEqual(["neu"]);
  });

  it("zeigt zwei Toasts, wenn zwei Quellen gleichzeitig melden", () => {
    const visible = selectVisibleToasts([entry("t3-alt", "t3"), entry("terminal", "terminal"), entry("t3-neu", "t3")]);
    expect(visible.map((item) => item.notification.id)).toEqual(["terminal", "t3-neu"]);
  });

  it("lässt null oder einen Eintrag unverändert", () => {
    expect(selectVisibleToasts([])).toEqual([]);
    const single = [entry("eins", "t3")];
    expect(selectVisibleToasts(single)).toEqual(single);
  });
});

describe("Toast-Gate", () => {
  const baseOptions = { toastsEnabled: true, sourceToastEnabled: true, alreadySeen: false };

  it("unterscheidet reaktivierte Meldungen über den Erstellungszeitpunkt", () => {
    const first = notification("11111111-1111-4111-8111-111111111111", "t3", { createdAt: "2026-09-13T06:00:00.000Z" });
    const again = { ...first, createdAt: "2026-09-13T07:00:00.000Z" };
    expect(toastIdentity(first)).not.toBe(toastIdentity(again));
    expect(shouldToastNotification(again, { ...baseOptions, alreadySeen: false })).toBe(true);
    expect(shouldToastNotification(first, { ...baseOptions, alreadySeen: true })).toBe(false);
  });

  it("unterdrückt bereits gesehene und unwichtige Meldungen", () => {
    const item = notification("22222222-2222-4222-8222-222222222222", "t3");
    expect(shouldToastNotification(item, { ...baseOptions, alreadySeen: true })).toBe(false);
    const info = notification("33333333-3333-4333-8333-333333333333", "hermes", { kind: "hermes.started", severity: "info" });
    expect(shouldToastNotification(info, baseOptions)).toBe(false);
    const error = notification("44444444-4444-4444-8444-444444444444", "hermes", { kind: "hermes.result", severity: "error" });
    expect(shouldToastNotification(error, baseOptions)).toBe(true);
  });

  it("beachtet die Schalter für Toasts und Quellen", () => {
    const item = notification("55555555-5555-4555-8555-555555555555", "t3");
    expect(shouldToastNotification(item, { ...baseOptions, toastsEnabled: false })).toBe(false);
    expect(shouldToastNotification(item, { ...baseOptions, sourceToastEnabled: false })).toBe(false);
    expect(shouldToastNotification(item, baseOptions)).toBe(true);
  });
});
