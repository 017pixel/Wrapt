import type { CodexResetHistoryResponse, ResetCredit, UsageTimelineLane } from "@wrapt/contracts";
import { CoinsIcon, ExternalLinkIcon, WarningIcon } from "../icons";
import { Badge } from "../primitives";
import { formatCountdown } from "../../lib/usageView";

const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value: string | null): string {
  if (!value) return "nicht bekannt";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateTime.format(date) : "nicht bekannt";
}

function creditTone(credit: ResetCredit, now: number): "ok" | "warn" | "bad" {
  if (credit.status.toLowerCase() !== "available") return "warn";
  if (credit.expiresAt && Date.parse(credit.expiresAt) <= now) return "bad";
  return "ok";
}

function creditStatus(credit: ResetCredit, now: number): string {
  if (credit.status.toLowerCase() !== "available") return credit.status;
  if (credit.expiresAt && Date.parse(credit.expiresAt) <= now) return "abgelaufen";
  return "verfügbar";
}

function creditExpiry(credit: ResetCredit, now: number): string {
  if (!credit.expiresAt) return "Kein Ablaufdatum bekannt";
  const expiresAt = Date.parse(credit.expiresAt);
  if (!Number.isFinite(expiresAt)) return "Ablaufdatum unbekannt";
  if (expiresAt <= now) return `Abgelaufen am ${formatDate(credit.expiresAt)}`;
  return `Gültig bis ${formatDate(credit.expiresAt)} · läuft in ${formatCountdown(expiresAt, now)}`;
}

function creditTitle(credit: ResetCredit): string {
  return credit.title === "Full reset" ? "Vollständiger Limit-Reset" : credit.title;
}

function creditDescription(credit: ResetCredit): string {
  return credit.description === "A free reset of your Codex limits" ? "Kostenloser Reset deiner Codex-Limits" : credit.description;
}

function accountCredits(lanes: UsageTimelineLane[]) {
  return lanes
    .filter((lane) => lane.providerId === "codex")
    .flatMap((lane) => lane.resetCredits.map((credit) => ({ account: lane.accountLabel, credit })))
    .sort((left, right) => (Date.parse(left.credit.expiresAt ?? "9999-12-31") - Date.parse(right.credit.expiresAt ?? "9999-12-31")));
}

export function CodexResetCreditsPanel({ lanes, visible, now: nowProp }: { lanes: UsageTimelineLane[]; visible: boolean; now?: number }) {
  const credits = accountCredits(lanes);
  const codexAccounts = lanes.filter((lane) => lane.providerId === "codex");
  if (!visible || codexAccounts.length === 0) return null;
  const now = nowProp ?? Date.now();
  const available = credits.filter(({ credit }) => creditStatus(credit, now) === "verfügbar").length;

  return (
    <section className="usage-forecast usage-reset-panel" aria-labelledby="codex-reset-credits-title">
      <div className="usage-section-heading">
        <div><p className="usage-provider-kicker">Codex</p><h2 id="codex-reset-credits-title">Banked Resets</h2></div>
        <Badge tone={available > 0 ? "ok" : "default"}>{available} verfügbar</Badge>
      </div>
      {credits.length === 0 ? <p className="usage-empty">Aktuell sind keine Banked Resets für die überwachten Codex-Accounts bekannt.</p> : (
        <ul className="usage-reset-list">
          {credits.map(({ account, credit }) => (
            <li key={`${account}-${credit.id}`}>
              <CoinsIcon />
              <div className="usage-reset-copy">
                <div className="usage-reset-title"><strong>{creditTitle(credit)}</strong><Badge tone={creditTone(credit, now)}>{creditStatus(credit, now)}</Badge></div>
                <p>{account} · vergeben am {formatDate(credit.grantedAt)}</p>
                <small>{creditExpiry(credit, now)}{credit.description ? ` · ${creditDescription(credit)}` : ""}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function historyStatus(data: CodexResetHistoryResponse): { label: string; tone: "ok" | "warn" | "bad" } {
  if (data.status === "available") return { label: "Aktuell", tone: "ok" };
  if (data.status === "stale") return { label: "Letzter Stand", tone: "warn" };
  return { label: "Nicht verfügbar", tone: "bad" };
}

export function CodexResetHistoryPanel({ data, isPending, isError }: { data: CodexResetHistoryResponse | undefined; isPending: boolean; isError: boolean }) {
  if (data?.status === "disabled") return null;
  const state = data ? historyStatus(data) : { label: "Lädt", tone: "default" as const };

  return (
    <section className="usage-forecast usage-reset-panel" aria-labelledby="codex-reset-history-title">
      <div className="usage-section-heading">
        <div><p className="usage-provider-kicker">Optionale Quelle</p><h2 id="codex-reset-history-title">Tibo-Reset-Historie</h2></div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      {isPending ? <p className="usage-empty">Globale Reset-Ankündigungen werden geladen.</p> : data?.status === "unavailable" || !data || isError ? (
        <p className="usage-reset-warning"><WarningIcon />Die externe Reset-Historie ist momentan nicht erreichbar.</p>
      ) : (
        <>
          <div className="usage-reset-stats">
            <span>Letzter Reset<strong>{formatDate(data.stats.lastResetAt)}</strong></span>
            <span>Erfasst<strong>{data.stats.total}</strong></span>
            <span>Ø Abstand<strong>{data.stats.averageIntervalDays === null ? "unbekannt" : `${data.stats.averageIntervalDays.toFixed(1)} Tage`}</strong></span>
          </div>
          {data.error ? <p className="usage-reset-warning"><WarningIcon />{data.error}</p> : null}
          {data.resets.length > 0 ? <ul className="usage-reset-list usage-reset-history-list">
            {data.resets.slice(0, 8).map((reset) => (
              <li key={reset.id}>
                <div className="usage-reset-history-date"><strong>{formatDate(reset.announcedAt)}</strong><Badge tone={reset.resetType === "banked" ? "accent" : "default"}>{reset.resetType === "banked" ? "Banked" : "Regulär"}</Badge></div>
                <div className="usage-reset-copy"><p>{reset.text}</p><a href={reset.sourceUrl} target="_blank" rel="noreferrer">Quelle auf X <ExternalLinkIcon /></a></div>
              </li>
            ))}
          </ul> : <p className="usage-empty">Noch keine Reset-Ankündigungen verfügbar.</p>}
          <small className="usage-reset-footnote">Globale Community-Historie, keine Bestätigung für deinen persönlichen Account.</small>
        </>
      )}
    </section>
  );
}
