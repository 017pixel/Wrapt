import { ChangelogStars } from "./ChangelogStars";
import { PopupArtwork } from "../PopupArtwork";
import changelogSource from "../../../../../CHANGELOG.md?raw";
import { HoverCard } from "./HoverCard";
import changelogSky from "../../assets/changelog/changelog-night-sky-surface.webp";
import {
  changelogEntriesForVersion,
  formatChangelogDate,
  parseChangelog,
  parseChangelogInline,
  type ChangelogEntry,
  type ChangelogText,
} from "./changelog";

/**
 * Changelog-Card über der Versionsanzeige der Statusleiste. Sie zeigt die
 * obersten Einträge der CHANGELOG.md bis zur laufenden Version; der Text wird
 * beim Web-Build mitgenommen und ist damit ohne API-Abruf sofort da.
 */
const allEntries = parseChangelog(changelogSource);

/** Grobe Schätzung; die Karte scrollt intern, wenn sie nicht reicht. */
function contentHeight(shown: ChangelogEntry[]): number {
  return shown.reduce(
    (total, entry) =>
      total +
      30 +
      entry.sections.reduce(
        (sum, section) => sum + (section.title ? 22 : 0) + section.items.length * 44,
        0,
      ),
    60,
  );
}

function InlineText({ parts }: { parts: ChangelogText[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "code") return <code key={index}>{part.text}</code>;
        if (part.kind === "strong") return <strong key={index}>{part.text}</strong>;
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

export function ChangelogHoverCard({
  anchor,
  version,
  onPointerEnter,
  onPointerLeave,
  onBlur,
}: {
  anchor: HTMLElement;
  /** Laufende Version des Dienstes; filtert noch nicht laufende Einträge aus. */
  version: string | null;
  onPointerEnter(): void;
  onPointerLeave(): void;
  onBlur(): void;
}) {
  const entries = changelogEntriesForVersion(allEntries, version);
  return (
    <HoverCard
      anchor={anchor}
      contentHeight={contentHeight(entries)}
      width={480}
      maxHeight={640}
      align="start"
      className="chc"
      label="Changelog"
      testId="changelog-card"
      header={
        <>
          <PopupArtwork className="chc-artwork" src={changelogSky} />
          <ChangelogStars />
          <div className="chc-heading">
            <h2>Changelog</h2>
            {entries[0] ? <span className="chc-current">v{entries[0].version}</span> : null}
          </div>
        </>
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
    >
      {entries.map((entry, index) => (
        <section className="chc-entry" key={entry.version}>
          <header className="chc-entry-head">
            <span className="chc-version">{entry.version}</span>
            {index === 0 ? <span className="chc-latest">Aktuell</span> : null}
            {entry.date ? (
              <time className="chc-date" dateTime={entry.date}>
                {formatChangelogDate(entry.date)}
              </time>
            ) : null}
          </header>
          {entry.sections.map((section, sectionIndex) => (
            <div className="chc-section" key={`${section.title}-${sectionIndex}`}>
              {section.title ? <p className="chc-section-title">{section.title}</p> : null}
              <ul className="chc-items">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineText parts={parseChangelogInline(item)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </HoverCard>
  );
}
