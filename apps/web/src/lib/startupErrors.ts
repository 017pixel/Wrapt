import { installGlobalErrorHandlers } from "./crashReport";
import { migrateLegacyBrowserStorage } from "./legacyStorageMigration";

// Muss vor dem App-Import laufen: Fehler beim Auswerten der App-Module sollen
// ebenso erfasst werden wie ein gesperrter Browser-Storage den Start nicht
// verhindern darf.
installGlobalErrorHandlers();
try {
  migrateLegacyBrowserStorage();
} catch {
  // Gesperrter Browser-Storage darf den App-Start nicht verhindern.
}
