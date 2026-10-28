import { bootstrapLegacyCommands } from "./legacyCommands";
import { bootstrapLegacyDashboardSections } from "./legacyDashboardSections";
import { bootstrapLegacyNavigation } from "./legacyNavigation";
import { bootstrapLegacyPageRoutes } from "./legacyPageRoutes";
import { bootstrapLegacySettingsCards } from "./legacySettingsCards";
import { bootstrapLegacyStatusBar } from "./legacyStatusBar";
import { bootstrapLegacyTopbar } from "./legacyTopbar";
import { bootstrapNotesBuiltins } from "./notesBuiltins";
import { bootstrapHermesV2Builtins } from "./hermesV2Builtins";
import { bootstrapHostContextMenus } from "./hostContextMenus";

/**
 * Temporary compatibility boundary for first-party product surfaces that are
 * already expressed through Extension registries but have not yet moved into
 * catalog-backed packages.
 *
 * The application shell imports only this function. New product features must
 * not add another legacy bootstrap import to main.tsx. They should ship as an
 * Extension or, during migration, be added behind this boundary with an
 * explicit removal path.
 */
export function bootstrapBuiltinContributions(): void {
  bootstrapLegacyPageRoutes();
  bootstrapLegacyNavigation();
  bootstrapNotesBuiltins();
  bootstrapHermesV2Builtins();
  bootstrapLegacyCommands();
  bootstrapLegacyStatusBar();
  bootstrapLegacyTopbar();
  bootstrapHostContextMenus();
  bootstrapLegacyDashboardSections();
  bootstrapLegacySettingsCards();
}
