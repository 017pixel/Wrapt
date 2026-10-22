// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  pageContributionSchema,
  routeContributionSchema,
} from "@wrapt/extension-contracts";
import {
  HERMES_V2_PATH,
  HERMES_V2_STANDALONE_PATH,
} from "../lib/hermesV2Routes";
import { pageRouteRegistry } from "./pageRouteRegistry";
import { registerHermesV2Builtins } from "./hermesV2Builtins";

const OWNER_ID = "wrapt.hermes-v2";
const COLLISION_OWNER_ID = "wrapt.hermes-v2-kollision-test";

const collisionBatch = () =>
  ({
    pages: [
      {
        contribution: pageContributionSchema.parse({
          id: "wrapt.hermes-v2-kollision-test.page",
          title: "Kollision",
        }),
        runtime: {
          chunkId: "hermes-v2-kollision-test",
          exportName: "KollisionRoute",
          loading: "eager",
          recovery: "none",
          load: () => Promise.resolve({ KollisionRoute: () => null }),
          eagerModule: { KollisionRoute: () => null },
        },
      },
    ],
    routes: [
      {
        contribution: routeContributionSchema.parse({
          id: "wrapt.hermes-v2-kollision-test.route",
          pageId: "wrapt.hermes-v2-kollision-test.page",
          path: HERMES_V2_STANDALONE_PATH,
        }),
        runtime: { boundary: "deferred-route", aliasBehavior: "render" },
      },
    ],
  }) as const;

describe("hermesV2Builtins", () => {
  afterEach(() => {
    pageRouteRegistry.removeOwner(OWNER_ID);
    pageRouteRegistry.removeOwner(COLLISION_OWNER_ID);
  });

  it("registriert Route und Standalone gemäß Inventory-Vertrag", () => {
    registerHermesV2Builtins();
    const routes = pageRouteRegistry.getSnapshot().routes.filter(
      (entry) => entry.ownerId === OWNER_ID,
    );
    const paths = routes.map((entry) => entry.value.contribution.path);
    const [main, standalone] = routes;
    expect(paths).toEqual([HERMES_V2_PATH, HERMES_V2_STANDALONE_PATH]);
    expect(main).toBeDefined();
    expect(standalone).toBeDefined();
    expect(main?.value.contribution.shell).toBe("full-bleed");
    expect(main?.value.contribution.persistent).toBe(true);
    expect(main?.value.contribution.topbar).toBe(true);
    expect(main?.value.contribution.breadcrumbs).toBe(false);
    expect(main?.value.contribution.mobileNavigation).toBe(true);
    expect(main?.value.contribution.projectContext).toBe(false);
    expect(standalone?.value.contribution.shell).toBe("standalone");
    expect(standalone?.value.contribution.persistent).toBe(false);
    expect(standalone?.value.contribution.topbar).toBe(false);
    expect(standalone?.value.contribution.mobileNavigation).toBe(false);
  });

  it("löst matchRoute auf beiden Pfaden auf und behält die Seitenbindung", () => {
    registerHermesV2Builtins();
    const main = pageRouteRegistry.matchRoute(HERMES_V2_PATH);
    const windowMatch = pageRouteRegistry.matchRoute(HERMES_V2_STANDALONE_PATH);
    expect(main?.route.value.contribution.pageId).toBe("wrapt.hermes-v2.page.main");
    expect(windowMatch?.route.value.contribution.pageId).toBe("wrapt.hermes-v2.page.window");
    expect(main?.alias).toBe(false);
    const pages = pageRouteRegistry.getSnapshot().pages.filter(
      (entry) => entry.ownerId === OWNER_ID,
    );
    expect(pages.map((page) => page.value.runtime.exportName)).toEqual([
      "HermesV2Route",
      "HermesV2StandaloneRoute",
    ]);
  });

  it("weist Kollisionen mit fremden Routen explizit ab", () => {
    registerHermesV2Builtins();
    expect(() =>
      pageRouteRegistry.replaceOwner(COLLISION_OWNER_ID, collisionBatch()),
    ).toThrow();
  });
});
