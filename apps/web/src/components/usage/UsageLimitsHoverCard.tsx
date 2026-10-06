import { Link } from "react-router";
import { createPortal } from "react-dom";
import { useLayoutEffect, useState } from "react";
import type { LimitsCardProvider } from "./usageLimitsCard";

/**
 * Die Limit-Card über der Statusleiste: je Provider alle gelieferten Fenster mit
 * Auslastung, Reset-Zeit und — sofern vorhanden — Banked Resets.
 *
 * Sie hängt per Portal am `document.body`, damit sie nicht am `overflow` der
 * Leiste oder am Mascot-Schriftschnitt klebt. Die Position wird aus dem
 * Anker-Rechteck berechnet und gegen den Viewport geklemmt.
 */

const CARD_WIDTH = 384;
const MIN_CARD_WIDTH = 320;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 10;
const POINTER_OFFSET = 28;
const CARD_MAX_HEIGHT = 460;

interface CardPosition {
  left: number;
  bottom: number;
  /** Höhe der Karte; nie größer als der Platz über oder unter dem Trigger. */
  height: number;
  placement: "above" | "below";
}

function windowMinHeight(
  windows: LimitsCardProvider["accounts"][number]["windows"],
): number {
  const providerHead = 26;
  const accountHead = 18;
  const perWindow = 30;
  const credits = 26;
  return providerHead + perWindow * windows.length + accountHead + credits;
}

function contentHeight(providers: LimitsCardProvider[]): number {
  return (
    44 +
    providers.reduce((total, provider) => {
      const accounts = provider.accounts.reduce(
        (sum, account) =>
          sum + windowMinHeight(account.windows) + (account.credits ? 34 : 0),
        provider.accounts.length * 12,
      );
      return total + 12 + Math.max(accounts, provider.note ? 28 : 0);
    }, 0) +
    44
  );
}

/**
 * Die Karte wird nie höher als der Raum, den der Trigger tatsächlich lässt.
 * Auf einem flachen Fenster wäre sie sonst über den oberen Bildschirmrand
 * hinaus gewachsen und Kopf wie erste Zeilen wären unerreichbar — der innere
 * Scrollbereich löst das nicht, weil er an einer Position startet, die es gar
 * nicht gibt. Darum wird zuerst der größere der beiden freien Bereiche gewählt
 * und die Höhe darauf begrenzt.
 */
function positionFor(anchorRect: DOMRect, content: number): CardPosition {
  const width = Math.min(
    CARD_WIDTH,
    Math.max(MIN_CARD_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2),
  );
  // Standardmäßig rechtsbündig über dem Trigger: er sitzt am rechten Rand, die
  // Karte wächst nach links. Fehlt rechts Platz, wird geklemmt.
  const preferredLeft = anchorRect.right - width;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(preferredLeft, window.innerWidth - width - VIEWPORT_MARGIN),
  );

  const spaceAbove = Math.max(0, anchorRect.top - ANCHOR_GAP - VIEWPORT_MARGIN);
  const spaceBelow = Math.max(
    0,
    window.innerHeight - anchorRect.bottom - ANCHOR_GAP - VIEWPORT_MARGIN,
  );
  const placeAbove = spaceAbove >= spaceBelow;
  const available = Math.max(0, placeAbove ? spaceAbove : spaceBelow);
  const height = Math.min(CARD_MAX_HEIGHT, content, available);

  // Platz unter dem Trigger ist ebenfalls gedeckt: das Setzen von `bottom`
  // reicht dann nicht, die Höhe muss die Position mitbestimmen.
  if (!placeAbove) {
    return {
      left,
      bottom: window.innerHeight - anchorRect.bottom - ANCHOR_GAP,
      height,
      placement: "below",
    };
  }
  return {
    left,
    bottom: Math.max(VIEWPORT_MARGIN, window.innerHeight - anchorRect.top + ANCHOR_GAP),
    height,
    placement: "above",
  };
}

export function UsageLimitsHoverCard({
  anchor,
  providers,
  updatedAt,
  onPointerEnter,
  onPointerLeave,
  onBlur,
}: {
  anchor: HTMLElement;
  providers: LimitsCardProvider[];
  updatedAt: string | null;
  onPointerEnter(): void;
  onPointerLeave(): void;
  onBlur(): void;
}) {
  const [position, setPosition] = useState<CardPosition>({
    left: VIEWPORT_MARGIN,
    bottom: VIEWPORT_MARGIN,
    height: CARD_MAX_HEIGHT,
    placement: "above",
  });
  const content = contentHeight(providers);

  useLayoutEffect(() => {
    const update = () =>
      setPosition(positionFor(anchor.getBoundingClientRect(), content));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, content]);

  const updatedLabel = updatedAt
    ? (() => {
        const at = Date.parse(updatedAt);
        if (!Number.isFinite(at)) return null;
        const minutes = Math.max(0, Math.floor((Date.now() - at) / 60_000));
        if (minutes < 1) return "gerade eben";
        if (minutes < 60) return `vor ${minutes} Min.`;
        return `vor ${Math.floor(minutes / 60)} Std.`;
      })()
    : null;

  return createPortal(
    <aside
      className="ulc"
      data-placement={position.placement}
      style={{
        left: position.left,
        bottom: position.bottom,
        maxHeight: position.height,
      }}
      role="dialog"
      aria-label="Nutzung und Limits"
      data-testid="usage-limits-card"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
    >
      {/* Der Kopf und der Fuß bleiben stehen; nur der Provider-Bereich scrollt.
          Der Scroll-Container muss innen liegen, weil `overflow` am Kartenrahmen
          den nach außen ragenden Pfeil abschneiden würde. */}
      <header className="ulc-head">
        <strong>Nutzung und Limits</strong>
        {updatedLabel ? (
          <span className="ulc-updated">aktualisiert {updatedLabel}</span>
        ) : null}
      </header>

      <div className="ulc-scroll">
        {providers.map((provider) => (
          <section
            className="ulc-provider"
            key={provider.providerId}
            data-tone={provider.tone}
          >
            <div className="ulc-provider-head">
              <span className="ulc-dot" aria-hidden="true" />
              <span className="ulc-provider-name">{provider.name}</span>
              {provider.accounts.length === 1 && provider.accounts[0]?.plan ? (
                <span className="ulc-plan">{provider.accounts[0].plan}</span>
              ) : null}
              {provider.accounts.length > 1 ? (
                <span className="ulc-plan">
                  {provider.accounts.length} Konten
                </span>
              ) : null}
            </div>

            {provider.note ? <p className="ulc-note">{provider.note}</p> : null}

            {provider.accounts.map((account, index) => (
              <div className="ulc-account" key={account.id}>
                {provider.accounts.length > 1 ? (
                  <p className="ulc-identity">
                    {index + 1}. {account.identity}
                    {account.plan ? ` · ${account.plan}` : ""}
                  </p>
                ) : null}

                {account.windows.map((window) => (
                  <div
                    className={`ulc-window is-${window.level}`}
                    key={window.key}
                  >
                    <div className="ulc-window-top">
                      <span className="ulc-window-label">{window.label}</span>
                      {window.resetsIn ? (
                        <span className="ulc-window-reset">
                          {window.resetsIn}
                        </span>
                      ) : null}
                      {/* Die Zahl ist der verbleibende Anteil: 45 % heißt
                          „45 % übrig", nicht „45 % verbraucht". Das „frei"
                          steht daneben, damit die Leserichtung eindeutig ist. */}
                      <span className="ulc-window-pct">
                        {window.remainingPercent} % <em>frei</em>
                      </span>
                    </div>
                    <div className="ulc-bar" role="presentation">
                      <i style={{ width: `${window.remainingPercent}%` }} />
                    </div>
                  </div>
                ))}

                {account.credits ? (
                  <p className="ulc-credits">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <ellipse
                        cx="8"
                        cy="8"
                        rx="6"
                        ry="6"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <path
                        d="M8 4.6v3.9l2.4 1.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>{account.credits.count} Reset-Guthaben</span>
                    {account.credits.expiresOn ? (
                      <span className="ulc-credits-until">
                        gültig bis {account.credits.expiresOn}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>

      <footer className="ulc-foot">
        <Link to="/usage" className="ulc-foot-link" onClick={onBlur}>
          Alle Nutzungsdaten öffnen
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 9L9 3M4.2 3H9v4.8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </footer>

      <span
        className="ulc-arrow"
        style={{ right: Math.min(POINTER_OFFSET, CARD_WIDTH / 4) }}
        aria-hidden="true"
      />
    </aside>,
    document.body,
  );
}
