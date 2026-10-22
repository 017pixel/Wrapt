import { contributionIdSchema, extensionIdSchema, navigationContributionSchema } from "@wrapt/extension-contracts";
import { ExtensionsIcon } from "../components/icons";
import { codePluginUi } from "./code-ui";
import type { NavigationRegistrySnapshot, OwnedNavigationItem } from "./navigationRegistry";

export function resolveCodeNavigation(snapshot: NavigationRegistrySnapshot, codeRevision = 0): NavigationRegistrySnapshot {
  const values = codePluginUi.resolve("navigation", snapshot.items.map((item) => ({ id: item.contributionId, surface: "navigation", title: item.value.contribution.label, path: item.value.route.path, order: item.value.contribution.order })));
  const items: OwnedNavigationItem[] = values.flatMap((value) => {
    const old = snapshot.items.find((entry) => entry.contributionId === value.id);
    if (old) return [{ ...old, value: { ...old.value, contribution: { ...old.value.contribution, label: value.title, order: value.order ?? 0 }, route: { ...old.value.route, path: value.path ?? old.value.route.path } } }];
    if (!value.path) return [];
    const ownerId = extensionIdSchema.parse(codePluginUi.ownerOf(value.id));
    const routeId = contributionIdSchema.parse(`${value.id}.route`);
    return [{ ownerId, contributionId: contributionIdSchema.parse(value.id), value: { contribution: navigationContributionSchema.parse({ id: value.id, routeId, label: value.title, group: "tools", order: value.order ?? 500, icon: "extension", visibleByDefault: true }), runtime: { icon: ExtensionsIcon }, route: { routeId, pageId: routeId, path: value.path, prefetch: "none", mobileNavigation: true } } }];
  });
  return { revision: snapshot.revision + codeRevision, items, byGroup: { workspace: items.filter((item) => item.value.contribution.group === "workspace"), tools: items.filter((item) => item.value.contribution.group === "tools"), extensions: items.filter((item) => item.value.contribution.group === "extensions"), account: items.filter((item) => item.value.contribution.group === "account"), system: items.filter((item) => item.value.contribution.group === "system") } };
}
