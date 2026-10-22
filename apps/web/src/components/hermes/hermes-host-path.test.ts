import { describe, expect, it } from "vitest";
import { hermesHostPath, hermesPathFromHostState, hermesSessionFromHostPath } from "./hermes-host-path";
import { hermesSessionPath } from "./HermesClassicShell";

describe("Hermespfade aus Hostmetadaten", () => {
  it.each([undefined, null, 4, {}, "", "https://fremd.test/chat", "//fremd.test", "/../settings",
    "/%2e%2e/settings", "/%2f/fremd", "/%5c/fremd", "/%00", "/chat#fremd", "/chat\\fremd",
    "/chat\n", "/%fe", "/" + "a".repeat(2_048)])("verwirft ungültigen Pfad %j", (value) => {
    expect(hermesHostPath(value)).toBeNull();
  });

  it("erhält interne Classicziele und vollständige URLkodierte Sitzungs-IDs", () => {
    expect(hermesHostPath("/settings?tab=models")).toBe("/settings?tab=models");
    for (const id of ["native-id", "ordner/id", "id mit Leerzeichen"]) {
      expect(hermesSessionFromHostPath(hermesSessionPath(id))).toBe(id);
    }
    expect(hermesPathFromHostState({ ownMarker: "bleibt", hermesAdminPath: "/chat?resume=a" }))
      .toBe("/chat?resume=a");
  });

  it.each([{}, [], null, { hermesAdminPath: "https://fremd.test" }])("liest beschädigten State %j nicht als URL", (state) => {
    expect(hermesPathFromHostState(state)).toBeNull();
  });

  it.each(["/settings?resume=a", "/chat", "/chat?resume=", "/chat?resume=a&resume=b",
    "/chat?resume=%00", `/chat?resume=${"a".repeat(201)}`])("übernimmt keine erfundene Sitzung aus %s", (path) => {
    expect(hermesSessionFromHostPath(path)).toBeNull();
  });
});
