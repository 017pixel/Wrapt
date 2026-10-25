import { PopupArtwork } from "../PopupArtwork";
import { Link } from "react-router";
import usageSky from "../../assets/dashboard-artwork/hero-notizen-nutzung-surface.webp";
import type { LimitsCardProvider } from "./usageLimitsCard";
import { HoverCard } from "../status/HoverCard";

/**
 * Die Limit-Card über der Statusleiste: je Provider alle gelieferten Fenster mit
 * Auslastung, Reset-Zeit und — sofern vorhanden — Banked Resets.
 *
 * Der Kartenrahmen kommt aus `HoverCard`; hier stehen nur die Limit-Inhalte.
 */

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


  return (
    <HoverCard
      anchor={anchor}
      contentHeight={800}
      width={500}
      maxHeight={Number.POSITIVE_INFINITY}
      label="Nutzung und Limits"
      testId="usage-limits-card"
      className="ulc-card"
      header={
        <>
          <PopupArtwork className="ulc-artwork" src={usageSky} />
          <div className="ulc-heading">
            <h2>Nutzung und Limits</h2>
            {updatedLabel ? (
              <span className="shc-meta">aktualisiert {updatedLabel}</span>
            ) : null}
          </div>
        </>
      }
      footer={
        <Link to="/usage" className="shc-foot-link" onClick={onBlur}>
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
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
    >
      {providers.length === 0 ? <p className="text-muted">Keine Limits verfügbar.</p> : null}
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
                  <span title={account.identity}>{index + 1}. {account.identity}</span>
                  {account.plan ? <span className="ulc-account-plan">{account.plan}</span> : null}
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
                  <div className="ulc-bar" role="meter" aria-label={`${provider.name}, ${account.identity}, ${window.label}: frei`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={window.remainingPercent}>
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
                  <span><strong>{account.credits.count}</strong> Reset-Guthaben</span>
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
    </HoverCard>
  );
}
