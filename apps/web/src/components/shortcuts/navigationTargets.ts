import type { NavigationRegistrySnapshot, OwnedNavigationItem } from "../../extensions/navigationRegistry";
import { isPageVisibleIn, type PageRouteId } from "../../stores/sidebarPreferences";
import { orderNavigation } from "../sidebar/navigationOrdering";

export function navigationTargets(navigation: NavigationRegistrySnapshot, hidden: ReadonlySet<string>, order: readonly string[]): OwnedNavigationItem[] {
  return (["workspace", "tools"] as const).flatMap((group) =>
    orderNavigation(navigation.byGroup[group].filter((item) => {
      const key = item.value.runtime.legacyVisibilityKey;
      return key === undefined ? item.value.contribution.visibleByDefault : isPageVisibleIn(hidden, key as PageRouteId);
    }), order));
}
export function numberShortcutIndex(code: string): number | null {
  const digit = /^Digit([0-9])$/.exec(code)?.[1];
  return digit === undefined ? null : digit === "0" ? 9 : Number(digit) - 1;
}
