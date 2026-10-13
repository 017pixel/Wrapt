import { describe, expect, it } from "vitest";
import changelogSource from "../../../../../CHANGELOG.md?raw";
import { CHANGELOG_ENTRY_LIMIT, changelogEntriesForVersion, formatChangelogDate, parseChangelog, parseChangelogInline } from "./changelog";

const FIXTURE = `# Changelog

Alle relevanten Änderungen werden in kurzen Stichpunkten dokumentiert.

## [2.4.0] - 2026-10-13

### Erstellt
- Erster Punkt
- Zweiter Punkt mit \`code\`

### Behoben
- Dritter Punkt

## [2.3.1] - 2026-10-12

### Verändert
- Vierter Punkt

## Ältere Versionen

- [1.25.2 bis 1.16.0](docs/changelog/1.25.2-bis-1.16.0.md)
`;

describe("parseChangelog", () => {
  it("liest Versionen, Datum, Abschnitte und Stichpunkte", () => {
    const entries = parseChangelog(FIXTURE);
    expect(entries.map((entry) => entry.version)).toEqual(["2.4.0", "2.3.1"]);
    expect(entries[0]!.date).toBe("2026-10-13");
    expect(entries[0]!.sections.map((section) => section.title)).toEqual(["Erstellt", "Behoben"]);
    expect(entries[0]!.sections[0]!.items).toEqual(["Erster Punkt", "Zweiter Punkt mit `code`"]);
  });

  it("ignoriert Vorspann und die Archivliste nach einem Nicht-Versions-Kopf", () => {
    const entries = parseChangelog(FIXTURE);
    expect(entries).toHaveLength(2);
    const allItems = entries.flatMap((entry) => entry.sections.flatMap((section) => section.items));
    expect(allItems.every((item) => !item.includes("docs/changelog"))).toBe(true);
  });

  it("hält Stichpunkte ohne Unterabschnitt sichtbar", () => {
    const [entry] = parseChangelog("## [1.0.0] - 2026-01-01\n- Ohne Abschnitt\n");
    expect(entry!.sections[0]!.title).toBe("");
    expect(entry!.sections[0]!.items).toEqual(["Ohne Abschnitt"]);
  });

  it("parst die echte CHANGELOG.md und deckt die laufende Version ab", () => {
    const entries = parseChangelog(changelogSource);
    expect(entries.length).toBeGreaterThanOrEqual(CHANGELOG_ENTRY_LIMIT);
    expect(entries[0]!.sections.flatMap((section) => section.items).length).toBeGreaterThan(0);
    // Die Hover-Card steht an der Versionsanzeige: Der oberste Eintrag muss
    // die Version aus package.json sein, sonst zeigen Leiste und Card
    // unterschiedliche Stände.
    expect(entries[0]!.version, "CHANGELOG.md muss die aktuelle Produktversion enthalten").toBe(__WRAPT_APP_VERSION__);
  });
});

describe("parseChangelogInline", () => {
  it("trennt Code, Fettschrift und Text", () => {
    expect(parseChangelogInline("Wert mit `code` und **fett** am Ende")).toEqual([
      { kind: "text", text: "Wert mit " },
      { kind: "code", text: "code" },
      { kind: "text", text: " und " },
      { kind: "strong", text: "fett" },
      { kind: "text", text: " am Ende" },
    ]);
  });

  it("lässt reinen Text unverändert", () => {
    expect(parseChangelogInline("Nur Text")).toEqual([{ kind: "text", text: "Nur Text" }]);
  });
});

describe("changelogEntriesForVersion", () => {
  const entries = parseChangelog(FIXTURE);

  it("schneidet Einträge über der laufenden Version ab und begrenzt die Anzahl", () => {
    expect(changelogEntriesForVersion(entries, "2.3.1").map((entry) => entry.version)).toEqual(["2.3.1"]);
    expect(changelogEntriesForVersion(entries, "9.0.0").map((entry) => entry.version)).toEqual(["2.4.0", "2.3.1"]);
  });

  it("zeigt ohne bekannte Version den obersten Ausschnitt", () => {
    expect(changelogEntriesForVersion(entries, null).map((entry) => entry.version)).toEqual(["2.4.0", "2.3.1"]);
  });
});

describe("formatChangelogDate", () => {
  it("formatiert ISO-Daten deutsch", () => {
    expect(formatChangelogDate("2026-10-13")).toBe("13. Oktober 2026");
  });

  it("gibt unbekannte Werte unverändert zurück", () => {
    expect(formatChangelogDate("kein-datum")).toBe("kein-datum");
  });
});
