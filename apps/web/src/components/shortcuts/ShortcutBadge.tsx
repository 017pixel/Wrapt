import { useNavigationRegistry } from "../../extensions/useNavigationRegistry";
import { useAppPreferences } from "../../stores/appPreferences";
import { sameModifiers, type ShortcutAction } from "../../config/shortcuts";
import { useSidebarPreferences } from "../../stores/sidebarPreferences";
import { navigationTargets } from "./navigationTargets";
import { useShortcutState } from "./shortcutState";

export function ShortcutBadge({ itemId }: { itemId: string }) {
  const showing = useShortcutState((state) => state.showingNumbers);
  const navigation = useNavigationRegistry();
  const hidden = useSidebarPreferences((state) => state.hiddenPages);
  const order = useSidebarPreferences((state) => state.navigationOrder);
  const shortcuts = useAppPreferences((state) => state.shortcuts);
  const item = navigation.items.find((entry) => entry.contributionId === itemId);
  const page = item?.value.runtime.legacyVisibilityKey;
  const action = page && ["settings", "usage", "plugins"].includes(page) ? page as ShortcutAction : null;
  const binding = action ? shortcuts.bindings[action] : null;
  const direct = showing && binding && shortcuts.numbers && sameModifiers(binding, shortcuts.numbers)
    ? binding.code.replace(/^(Key|Digit)/, "") : null;
  const index = showing ? navigationTargets(navigation, hidden, order).slice(0, 10).findIndex((item) => item.contributionId === itemId) : -1;
  return (
    <span className="sidebar-shortcut-hints" aria-hidden="true">
      {index >= 0 ? <kbd className="sidebar-shortcut-badge" data-number-hint>{(index + 1) % 10}</kbd> : null}
      {direct ? <kbd className="sidebar-shortcut-badge">{direct}</kbd> : null}
    </span>
  );
}
