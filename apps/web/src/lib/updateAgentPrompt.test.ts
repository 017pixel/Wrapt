import { describe, expect, it } from "vitest";
import { buildUpdateAgentPrompt, hasRemoteUpdate, updateStatusLabel } from "./updateAgentPrompt";

const base = {
  branch: "master",
  version: "1.6.0",
  checkedAt: new Date("2026-09-06T06:00:00.000Z").toISOString(),
  message: "Update verfügbar.",
};

describe("update-agent-prompt", () => {
  it("erkennt ein entferntes Update", () => {
    expect(hasRemoteUpdate({ ...base, localHash: "aaa", localShort: "aaa", remoteHash: "bbb", remoteShort: "bbb", updateAvailable: true, dirty: false, dirtyFiles: [], dirtyCount: 0 })).toBe(true);
    expect(hasRemoteUpdate({ ...base, localHash: "aaa", localShort: "aaa", remoteHash: "aaa", remoteShort: "aaa", updateAvailable: false, dirty: false, dirtyFiles: [], dirtyCount: 0 })).toBe(false);
  });

  it("baut einen Prompt mit Update-Hinweis und Stand", () => {
    const prompt = buildUpdateAgentPrompt({
      ...base,
      localHash: "aaa111",
      localShort: "aaa111",
      remoteHash: "bbb222",
      remoteShort: "bbb222",
      updateAvailable: false,
      dirty: true,
      dirtyFiles: ["apps/web/src/App.tsx"],
      dirtyCount: 1,
      message: "Update verfügbar, aber es gibt lokale Änderungen.",
    });
    expect(prompt).toContain("Es gibt ein Update im GitHub-Repository");
    expect(prompt).toContain("aaa111");
    expect(prompt).toContain("bbb222");
    expect(prompt).toContain("git pull --ff-only origin master");
    expect(prompt).toContain("apps/web/src/App.tsx");
    expect(prompt).toContain("extensions/personal-plugins");
  });

  it("labelt sauberen und schmutzigen Stand", () => {
    expect(updateStatusLabel({ ...base, localHash: "a", localShort: "a", remoteHash: "a", remoteShort: "a", updateAvailable: false, dirty: false, dirtyFiles: [], dirtyCount: 0 })).toBe("Aktuell");
    expect(updateStatusLabel({ ...base, localHash: "a", localShort: "a", remoteHash: "a", remoteShort: "a", updateAvailable: false, dirty: true, dirtyFiles: [], dirtyCount: 2 })).toBe("Lokale Änderungen");
  });
});
