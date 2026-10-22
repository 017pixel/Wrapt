import { useMemo, useState } from "react";
import { Link } from "react-router";
import { SkillsIcon } from "../../icons";
import type { HermesV2Resources } from "./resource-types";
import {
  enabledLabel,
  provenanceLabel,
  slashLabel,
} from "./knowledge-format";
import { TextBlock } from "./resource-text";
import {
  HermesV2SettingsGroup,
  HermesV2SettingsPage,
  HermesV2SettingsRow,
  HermesV2SettingsSection,
} from "./hermes-v2-settings";
import "./hermes-v2-resources.css";

/**
 * Skills-Bereich als Verwaltungsseite: der native Katalog steht als Liste
 * in einer Kartengruppe, der gewählte Skill öffnet darunter seinen
 * belegten Inhalt. Details sind namensgebunden gelesen und stets
 * read-only; persönliche Bearbeitung läuft über den vorhandenen Editor.
 */
export function HermesV2SkillsArea({ resources }: { resources: HermesV2Resources }) {
  const list = resources.skills.list;
  const skills = useMemo(
    () => list.data?.skills ?? [],
    [list.data],
  );
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        skill.description.toLowerCase().includes(needle) ||
        (skill.slashCommand ?? "").toLowerCase().includes(needle),
    );
  }, [skills, query]);
  const selectedName = resources.skills.selectedName;
  const detail = resources.skills.detail;
  const selected = skills.find((skill) => skill.name === selectedName) ?? null;
  const editorPath = detail.data?.editorPath ?? list.data?.editorPath ?? null;

  return (
    <HermesV2SettingsPage
      title="Skills"
      area="skills"
      description="Nativer Skillkatalog des Agenten. Die Inhalte bleiben read-only; bearbeitet wird im KI-Skills-Editor."
      actions={
        <button
          type="button"
          className="quiet-button"
          disabled={list.status === "loading" || !resources.available}
          onClick={() => void resources.refresh()}
        >
          Skills aktualisieren
        </button>
      }
    >
      <HermesV2SettingsSection
        title="Katalog"
        icon={<SkillsIcon />}
        toolbar={
          <input
            type="search"
            className="hermesv2-input"
            aria-label="Skills nach Beschreibung, Namen und Slashbefehl suchen"
            placeholder="Suche nach Beschreibung, Name, Slashbefehl"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
      >
        <HermesV2SettingsGroup>
          {list.status === "idle" ? (
            <HermesV2SettingsRow title="Skills noch nicht geladen." />
          ) : null}
          {list.status === "loading" ? (
            <HermesV2SettingsRow title="Skills werden geladen…" />
          ) : null}
          {list.status === "missing" ? (
            <HermesV2SettingsRow title="Der Skills-Katalog ist nativ nicht erreichbar." />
          ) : null}
          {list.status === "error" && list.error ? (
            <HermesV2SettingsRow
              title="Skillkatalog nicht lesbar"
              status={list.error.message}
              control={
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void resources.refresh()}
                >
                  Erneut laden
                </button>
              }
            />
          ) : null}
          {list.status === "ready" && list.data && filtered.length === 0 ? (
            <HermesV2SettingsRow
              title={skills.length === 0 ? "Keine Skills vorhanden." : "Keine Treffer."}
              description={
                skills.length === 0
                  ? undefined
                  : "Die Suche deckt nur den gelieferten Katalog ab."
              }
            />
          ) : null}
          {list.data?.truncated ? (
            <HermesV2SettingsRow title="Liste ist gekürzt" description="Der Katalog zeigt nicht alles." />
          ) : null}
          {list.stale ? (
            <HermesV2SettingsRow title="Angemeldete Liste ist veraltet." />
          ) : null}
          {filtered.map((skill) => (
            <HermesV2SettingsRow
              key={skill.name}
              selected={skill.name === selectedName}
              title={
                <button
                  type="button"
                  className="hermesv2-settings-row-link"
                  aria-label={`Skill: ${skill.name}`}
                  aria-current={skill.name === selectedName ? "true" : undefined}
                  data-hermes-skill={skill.name}
                  onClick={() => resources.selectSkill(skill.name)}
                >
                  {skill.name}
                </button>
              }
              description={skill.description}
              status={[
                enabledLabel(skill.enabled),
                provenanceLabel(skill.provenance),
                slashLabel(skill.slashCommand),
              ].join(" · ")}
            />
          ))}
        </HermesV2SettingsGroup>
      </HermesV2SettingsSection>
      <HermesV2SettingsSection title="Details">
        {selectedName === null ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Wähle einen Skill aus." />
          </HermesV2SettingsGroup>
        ) : !selected ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow
              title="Der gewählte Name gehört nicht zum aktuellen Katalog."
              description="Treffe die Auswahl aus der Liste neu."
            />
          </HermesV2SettingsGroup>
        ) : detail.status === "loading" ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Details werden geladen…" />
          </HermesV2SettingsGroup>
        ) : detail.status === "idle" ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Details noch nicht geladen." />
          </HermesV2SettingsGroup>
        ) : detail.status === "missing" ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Dieser Skill hat keinen nativen Detailbeleg." />
          </HermesV2SettingsGroup>
        ) : detail.error ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow
              title="Skillinhalt nicht lesbar"
              status={detail.error.message}
            />
          </HermesV2SettingsGroup>
        ) : detail.data ? (
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Name" status={detail.data.skill.name} />
            <HermesV2SettingsRow
              title="Status"
              status={[
                enabledLabel(detail.data.skill.enabled),
                provenanceLabel(detail.data.skill.provenance),
                slashLabel(detail.data.skill.slashCommand),
              ].join(" · ")}
            />
            <HermesV2SettingsRow title="Beleg" status={detailStatusLine(detail.data.content, detail.data.skill.readOnly)} />
            <HermesV2SettingsRow title="Inhalt">
              <TextBlock text={detail.data.content} ariaLabel={`Inhalt: ${detail.data.skill.name}`} />
            </HermesV2SettingsRow>
            {editorPath ? (
              <HermesV2SettingsRow
                title="Bearbeiten"
                description="Der native Katalog bleibt read-only."
                control={
                  <Link className="quiet-button" to={editorPath}>
                    Im KI-Skills-Editor öffnen
                  </Link>
                }
              />
            ) : null}
          </HermesV2SettingsGroup>
        ) : null}
      </HermesV2SettingsSection>
    </HermesV2SettingsPage>
  );
}

/** Read-only bleibt sichtbar behauptet, genau wie der Kürzungshinweis. */
function detailStatusLine(
  content: { truncated: boolean },
  readOnly: boolean,
): string {
  return [
    readOnly ? "Nur lesbarer nativer Beleg" : null,
    content.truncated ? "gekürzt" : "ungekürzt",
  ]
    .filter(Boolean)
    .join(" · ");
}
