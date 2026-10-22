import type { ReactNode } from "react";
import "./hermes-v2-settings.css";

/**
 * Verwaltungsseiten im Stil der T3-Einstellungen: ein Kopf mit Aktionen,
 * darunter Abschnitte mit Überschrift, Kartengruppen und Zeilen, in denen
 * Titel und Beschreibung links und das Bedienelement rechts stehen.
 *
 * Der Seitentitel steht bereits in der Werkzeugleiste der Fläche; die Seite
 * wiederholt ihn nicht. Ihre Abschnitte tragen die sichtbaren Überschriften.
 *
 * Reine Darstellung ohne eigene Datenhaltung: jede Fläche übergibt Inhalt,
 * Aktionen und Zustände selbst. Farben kommen ausschließlich aus den
 * Theme-Tokens; die Seiten erfinden keine eigenen Hexwerte.
 */
export function HermesV2SettingsPage({
  title,
  description,
  actions,
  area,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Flächenmarker für Browserprüfungen. */
  area?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="hermesv2-settings"
      aria-label={title}
      data-hermes-area={area}
    >
      <header className="hermesv2-settings-head">
        {description ? (
          <p className="hermesv2-settings-note">{description}</p>
        ) : null}
        {actions ? (
          <div className="hermesv2-settings-actions">{actions}</div>
        ) : null}
      </header>
      <div className="hermesv2-settings-body">{children}</div>
    </section>
  );
}

/**
 * Ein Abschnitt der Verwaltungsseite. Überschrift und Kopfaktionen stehen
 * nebeneinander; darunter folgen optional ein Werkzeugstreifen (Suche,
 * Filter) und die Inhalte.
 */
export function HermesV2SettingsSection({
  title,
  icon,
  actions,
  toolbar,
  children,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="hermesv2-settings-section" aria-label={title}>
      <header className="hermesv2-settings-section-head">
        <h2 className="hermesv2-settings-section-title">
          {icon ? (
            <span className="hermesv2-settings-section-icon" aria-hidden>
              {icon}
            </span>
          ) : null}
          {title}
        </h2>
        {actions ? (
          <div className="hermesv2-settings-section-actions">{actions}</div>
        ) : null}
      </header>
      {toolbar ? (
        <div className="hermesv2-settings-toolbar">{toolbar}</div>
      ) : null}
      {children}
    </section>
  );
}

/** Kartengruppe: fasst Zeilen einer Sache zusammen und trennt sie sauber. */
export function HermesV2SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="hermesv2-settings-group">{children}</div>;
}

/**
 * Eine Zeile der Kartengruppe. `htmlFor` verbindet den Titel mit einem
 * Bedienelement und gibt diesem seinen zugänglichen Namen; ohne `htmlFor`
 * ist der Titel eine reine Überschrift.
 */
export function HermesV2SettingsRow({
  title,
  description,
  status,
  control,
  htmlFor,
  selected,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  control?: ReactNode;
  htmlFor?: string;
  selected?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className="hermesv2-settings-row"
      data-selected={selected ? "true" : undefined}
    >
      <div className="hermesv2-settings-row-main">
        {htmlFor ? (
          <label className="hermesv2-settings-row-title" htmlFor={htmlFor}>
            {title}
          </label>
        ) : (
          <h3 className="hermesv2-settings-row-title">{title}</h3>
        )}
        {description ? (
          <p className="hermesv2-settings-row-note">{description}</p>
        ) : null}
        {status ? (
          <div className="hermesv2-settings-row-status">{status}</div>
        ) : null}
      </div>
      {control ? (
        <div className="hermesv2-settings-row-control">{control}</div>
      ) : null}
      {children ? (
        <div className="hermesv2-settings-row-extra">{children}</div>
      ) : null}
    </div>
  );
}
