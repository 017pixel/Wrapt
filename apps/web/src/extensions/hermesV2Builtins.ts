import {
  extensionIdSchema,
  pageContributionSchema,
  routeContributionSchema,
  type ExtensionId,
  type RouteContribution,
} from "@wrapt/extension-contracts";
import { loadRouteWithRecovery } from "../lib/routeModules";
import { HERMES_V2_PATH, HERMES_V2_STANDALONE_PATH } from "../lib/hermesV2Routes";
import {
  pageRouteRegistry,
  type PageRouteOwnerBatch,
  type PageRuntimeBinding,
  type RouteRuntimeBinding,
} from "./pageRouteRegistry";

/**
 * Eigene Registrierung der experimentellen Hermes-V2-Fläche. Genau wie die
 * Notizen bleibt das Feature außerhalb der eingefrorenen Legacy-Built-ins:
 * Der Compatibility-Boundary ruft `bootstrapHermesV2Builtins()` direkt auf.
 * Es wird bewusst keine Hauptnavigation registriert — der V2-Einstieg ist der
 * bestehende Hermes-Eintrag in der klassischen Shell (`HermesShell`).
 */

const HERMES_V2_OWNER_ID = extensionIdSchema.parse("wrapt.hermes-v2");

function hermesV2PageRuntime(exportName: string): PageRuntimeBinding {
  return Object.freeze({
    chunkId: "hermes-v2",
    exportName,
    loading: "lazy",
    recovery: "stale-chunk",
    load: () => loadRouteWithRecovery(() => import("../views/HermesV2Route")),
  });
}

function hermesV2RouteRuntime(): RouteRuntimeBinding {
  return Object.freeze({
    boundary: "deferred-route",
    aliasBehavior: "render",
  });
}

/** Verbindlicher Vertrag aus dem Inventory: volle Fläche mit Wrapt-Navigation. */
const hermesV2MainRoute: RouteContribution = routeContributionSchema.parse({
  id: "wrapt.hermes-v2.route.main",
  pageId: "wrapt.hermes-v2.page.main",
  path: HERMES_V2_PATH,
  shell: "full-bleed",
  persistent: true,
  prefetch: "none",
  projectContext: false,
  topbar: true,
  breadcrumbs: false,
  standaloneActions: false,
  mobileNavigation: true,
});

/** Fokussierte Oberfläche ohne Wrapt-Navigation und ohne Topbar. */
const hermesV2StandaloneRoute: RouteContribution = routeContributionSchema.parse({
  id: "wrapt.hermes-v2.route.window",
  pageId: "wrapt.hermes-v2.page.window",
  path: HERMES_V2_STANDALONE_PATH,
  shell: "standalone",
  persistent: false,
  prefetch: "none",
  projectContext: false,
  topbar: false,
  breadcrumbs: false,
  standaloneActions: false,
  mobileNavigation: false,
});

const hermesV2Batch: PageRouteOwnerBatch = Object.freeze({
  pages: Object.freeze([
    Object.freeze({
      contribution: pageContributionSchema.parse({
        id: "wrapt.hermes-v2.page.main",
        title: "Hermes V2",
        description: "Experimentelle native Hermes-Oberfläche",
      }),
      runtime: hermesV2PageRuntime("HermesV2Route"),
    }),
    Object.freeze({
      contribution: pageContributionSchema.parse({
        id: "wrapt.hermes-v2.page.window",
        title: "Hermes V2 Fokussiert",
        description: "Hermes V2 im eigenen Browserfenster",
      }),
      runtime: hermesV2PageRuntime("HermesV2StandaloneRoute"),
    }),
  ]),
  routes: Object.freeze([
    Object.freeze({ contribution: hermesV2MainRoute, runtime: hermesV2RouteRuntime() }),
    Object.freeze({ contribution: hermesV2StandaloneRoute, runtime: hermesV2RouteRuntime() }),
  ]),
});

export function registerHermesV2Builtins(ownerId: ExtensionId = HERMES_V2_OWNER_ID): void {
  pageRouteRegistry.replaceOwner(ownerId, hermesV2Batch);
}

let bootstrapped = false;

export function bootstrapHermesV2Builtins(): void {
  if (bootstrapped) return;
  registerHermesV2Builtins();
  bootstrapped = true;
}
