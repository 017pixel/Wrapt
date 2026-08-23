import type { OwnedNavigationItem } from "../../extensions/navigationRegistry";

export function orderNavigation(items: readonly OwnedNavigationItem[], order: readonly string[]): OwnedNavigationItem[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((left, right) =>
    (positions.get(left.contributionId) ?? Number.MAX_SAFE_INTEGER)
      - (positions.get(right.contributionId) ?? Number.MAX_SAFE_INTEGER));
}
