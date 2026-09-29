import { useState } from "react";
import { CloseIcon, DownloadIcon } from "../icons";
import { usePwaInstall } from "../../lib/usePwaInstall";

export const PWA_INSTALL_HINT_DISMISSED_KEY = "wrapt.pwa-install-hint.dismissed.v1";

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PWA_INSTALL_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function PwaInstallHint() {
  const pwa = usePwaInstall();
  const [dismissed, setDismissed] = useState(readDismissed);
  const isAndroidMobile = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const isMobileDevice = pwa.isAppleMobile || isAndroidMobile;
  const canShow = isMobileDevice && !pwa.isInstalled && !dismissed && (pwa.isAppleMobile || pwa.canInstall);

  if (!canShow) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(PWA_INSTALL_HINT_DISMISSED_KEY, "1");
    } catch {
      // Gesperrter Browser-Storage darf den Hinweis nicht festhalten.
    }
    setDismissed(true);
  };

  return (
    <aside className="pwa-install-hint" aria-label="Wrapt installieren">
      <div className="pwa-install-hint-copy">
        <strong>Wrapt als App nutzen</strong>
        <span>{pwa.isAppleMobile
          ? "Tippe im Browser auf „Teilen“ und wähle „Zum Home-Bildschirm“."
          : "Installiere Wrapt für den direkten Start vom Home-Bildschirm."}</span>
      </div>
      {pwa.canInstall ? (
        <button type="button" className="pwa-install-hint-action" onClick={() => void pwa.install()}>
          <DownloadIcon className="h-4 w-4" /> Installieren
        </button>
      ) : null}
      <button type="button" className="pwa-install-hint-close" onClick={dismiss} aria-label="Installationshinweis ausblenden">
        <CloseIcon className="h-4 w-4" />
      </button>
    </aside>
  );
}
