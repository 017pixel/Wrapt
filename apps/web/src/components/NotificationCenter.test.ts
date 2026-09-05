// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { Notification } from "@wrapt/contracts";
import { selectVisibleToasts } from "./NotificationCenter";

function entry(id: string, source: Notification["source"]) {
  return {
    notification: {
      id, source, category: "coding-agent", sourceIcon: "t3", kind: "agent.completed",
      severity: "success", state: "active", title: "Fertig", body: "fertig",
      link: null, remoteId: null, createdAt: new Date().toISOString(),
      readAt: null, acknowledgedAt: null, deletedAt: null, resolvedAt: null,
      meta: {}, report: null,
    } as Notification,
    leaving: false,
  };
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
