import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { SkillEditorFile, SkillEditorNode, SkillEditorTreeResponse } from "@wrapt/contracts";
import { ChevronRightIcon, EditIcon, FileIcon, FolderIcon, LinkIcon, NoteIcon, PlusIcon, TrashIcon, WarningIcon } from "../icons";
import {
  groupHermesByCategory,
  skillMatchesQuery,
  type HermesSkillNode,
  type SkillRuleEntry,
  type SkillScope,
} from "../../lib/skillEditor";

interface SkillTreeProps {
  tree: SkillEditorTreeResponse;
  selectedPath: string | null;
  onSelect: (file: SkillEditorFile) => void;
  onCreate: () => void;
  onCreateHermes?: (() => void) | undefined;
  onRename: (skill: SkillEditorNode, scope?: SkillScope) => void;
  onDelete: (skill: SkillEditorNode, scope?: SkillScope) => void;
  /** Freitextfilter über Name, Beschreibung und Dateinamen aller Gruppen. */
  query?: string;
}

/** Einrückung eines Eintrags innerhalb seines Skill-Ordners. */
function depthOf(skill: SkillEditorNode, file: SkillEditorFile): number {
  return file.path.slice(skill.path.length + 1).split("/").length;
}

function FileRow({ file, depth, selected, onSelect, index = 0 }: {
  file: SkillEditorFile;
  depth: number;
  selected: boolean;
  onSelect: (file: SkillEditorFile) => void;
  index?: number;
}) {
  const disabled = file.kind === "directory" || file.broken || !file.editable;
  return (
    <div
      role="treeitem"
      aria-level={3}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      className={`skill-tree-row skill-tree-file ${selected ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
      style={{ "--skill-depth": depth, animationDelay: `${Math.min(index, 8) * 30}ms` } as CSSProperties}
      onClick={() => { if (!disabled) onSelect(file); }}
    >
      <span className="skill-tree-icon">
        {file.broken ? <WarningIcon className="h-3.5 w-3.5" aria-hidden />
          : file.kind === "directory" ? <FolderIcon className="h-3.5 w-3.5" aria-hidden />
            : <FileIcon className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="skill-tree-name">
        <span className="skill-tree-label" title={file.path}>{file.name}</span>
        {file.symlink ? <LinkIcon className="skill-tree-link h-3 w-3" aria-label="Verweis" /> : null}
      </span>
      {file.broken ? <span className="skill-tree-flag">defekt</span> : null}
    </div>
  );
}

function SkillBranch({ skill, scope, selectedPath, onSelect, onRename, onDelete, forceOpen = false }: {
  skill: SkillEditorNode;
  scope: SkillScope;
  selectedPath: string | null;
  onSelect: (file: SkillEditorFile) => void;
  onRename: (skill: SkillEditorNode, scope?: SkillScope) => void;
  onDelete: (skill: SkillEditorNode, scope?: SkillScope) => void;
  /** Bei aktiver Suche stehen die Treffer offen, sonst müsste man jeden Skill einzeln aufklappen. */
  forceOpen?: boolean;
}) {
  const containsSelection = selectedPath?.startsWith(`${skill.path}/`) ?? false;
  const [open, setOpen] = useState(containsSelection);
  const expanded = open || containsSelection || forceOpen;
  const missingDescription = !skill.broken && !(skill.description ?? "").trim();

  return (
    <div className="skill-tree-branch">
      <div
        role="treeitem"
        aria-level={2}
        aria-expanded={expanded}
        tabIndex={-1}
        className={`skill-tree-row skill-tree-skill ${containsSelection ? "is-current" : ""}`}
        onClick={() => setOpen(!expanded)}
      >
        <button
          type="button"
          className="skill-tree-toggle"
          aria-label={`${skill.name} ${expanded ? "einklappen" : "aufklappen"}`}
          onClick={(event) => { event.stopPropagation(); setOpen(!expanded); }}
        >
          <ChevronRightIcon className={`skill-tree-chevron ${expanded ? "is-open" : ""}`} />
        </button>
        <span className="skill-tree-skill-text">
          <span className="skill-tree-name">
            <span className="skill-tree-label" title={skill.path}>{skill.name}</span>
            {skill.symlink ? <LinkIcon className="skill-tree-link h-3 w-3" aria-label="Verweis" /> : null}
            {skill.broken ? <span className="skill-tree-flag">defekt</span>
              : missingDescription ? <span className="skill-tree-hint">ohne Beschreibung</span> : null}
          </span>
          <span className="skill-tree-description">
            {skill.broken ? "Der Verweis zeigt ins Leere." : skill.description ?? "Ohne Beschreibung — dieser Skill wird nie geladen."}
          </span>
        </span>
        <span className="skill-tree-actions">
          {skill.broken ? null : (
            <button
              type="button"
              aria-label={`${skill.name} umbenennen`}
              title="Umbenennen"
              onClick={(event) => { event.stopPropagation(); onRename(skill, scope); }}
            >
              <EditIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-label={`${skill.name} löschen`}
            title="Löschen"
            onClick={(event) => { event.stopPropagation(); onDelete(skill, scope); }}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      <div className={`skill-tree-collapse ${expanded ? "is-open" : "is-closed"}`}>
        <div className="skill-tree-collapse-inner">
          {skill.broken
            ? <p className="skill-tree-empty">Ziel nicht gefunden. Der Skill lässt sich nur noch löschen.</p>
            : skill.files.map((entry, index) => (
              <FileRow key={entry.path} file={entry} depth={depthOf(skill, entry)} selected={selectedPath === entry.path} onSelect={onSelect} index={index} />
            ))}
        </div>
      </div>
    </div>
  );
}

function TreeGroup({ id, title, count, addLabel, onAdd, forceOpen = false, children }: {
  id: string;
  title: string;
  count: number;
  addLabel?: string | undefined;
  onAdd?: (() => void) | undefined;
  forceOpen?: boolean | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const expanded = open || forceOpen;
  return (
    <section className="skill-tree-group" aria-label={`${title} (${count})`}>
      <div className="skill-tree-section">
        <button
          type="button"
          className="skill-tree-group-head"
          aria-expanded={expanded}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(!expanded)}
        >
          <ChevronRightIcon className={`skill-tree-chevron ${expanded ? "is-open" : ""}`} aria-hidden />
          <span>{title} ({count})</span>
        </button>
        {onAdd && addLabel ? (
          <button type="button" className="skill-tree-add" onClick={onAdd} aria-label={addLabel} title={addLabel}>
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div id={`${id}-body`} className={`skill-tree-collapse ${expanded ? "is-open" : "is-closed"}`}>
        <div className="skill-tree-collapse-inner">{children}</div>
      </div>
    </section>
  );
}

export function SkillTree({
  tree,
  selectedPath,
  onSelect,
  onCreate,
  onCreateHermes,
  onRename,
  onDelete,
  query = "",
}: SkillTreeProps) {
  const needle = query.trim().toLocaleLowerCase("de");

  // ruleEntries trägt die Harness- und Hermes-Regeln; bei alten Ständen ohne
  // das Feld dient die einzelne agentsFile als Rückfall.
  const rules: SkillRuleEntry[] = useMemo(() => {
    const entries = tree.ruleEntries ?? [];
    if (entries.length > 0) return entries;
    if (!tree.agentsFile) return [];
    return [{
      id: "agents",
      label: "Globale Agenten-Regeln",
      path: tree.agentsFile.path,
      editable: tree.agentsFile.editable,
      symlinkTarget: null,
    }];
  }, [tree.agentsFile, tree.ruleEntries]);

  const visibleRules = useMemo(() => {
    if (!needle) return rules;
    return rules.filter((rule) =>
      rule.label.toLocaleLowerCase("de").includes(needle) ||
      rule.path.split("/").pop()!.toLocaleLowerCase("de").includes(needle),
    );
  }, [needle, rules]);

  const skills = useMemo(
    () => (needle ? tree.skills.filter((skill) => skillMatchesQuery(skill, needle)) : tree.skills),
    [needle, tree.skills],
  );
  // hermesSkills liefert je Eintrag zusätzlich die Kategorie aus dem Ordnernamen.
  const hermes = useMemo(() => {
    const source: HermesSkillNode[] = tree.hermesSkills ?? [];
    return needle ? source.filter((skill) => skillMatchesQuery(skill, needle)) : source;
  }, [needle, tree.hermesSkills]);
  const hermesGroups = useMemo(() => groupHermesByCategory(hermes), [hermes]);
  const searching = needle.length > 0;
  const nothingFound = searching && visibleRules.length === 0 && skills.length === 0 && hermes.length === 0;

  const openRule = (rule: SkillRuleEntry) => {
    onSelect({
      name: rule.label,
      path: rule.path,
      kind: "file",
      sizeBytes: null,
      modifiedAt: null,
      symlink: rule.symlinkTarget != null,
      broken: false,
      editable: rule.editable,
    });
  };

  return (
    <nav className="skill-tree" role="tree" aria-label="Globale Regeln, Skills und Hermes-Skills">
      {(!searching || visibleRules.length > 0) && (
        <TreeGroup id="rules" title="Globale Regeln" count={visibleRules.length} forceOpen={searching && visibleRules.length > 0}>
          {visibleRules.length === 0
            ? <p className="skill-tree-empty">Keine globalen Regeln gefunden.</p>
            : visibleRules.map((rule) => (
              <div
                key={rule.id}
                role="treeitem"
                aria-level={1}
                aria-selected={selectedPath === rule.path}
                aria-disabled={!rule.editable || undefined}
                tabIndex={-1}
                className={`skill-tree-row skill-tree-rule ${selectedPath === rule.path ? "is-open" : ""} ${rule.editable ? "" : "is-disabled"}`}
                title={rule.editable ? rule.path : "Diese Datei ist nicht vorhanden oder nicht lesbar."}
                onClick={() => { if (rule.editable) openRule(rule); }}
              >
                <span className="skill-tree-icon">
                  {rule.id === "agents"
                    ? <NoteIcon className="h-3.5 w-3.5" aria-hidden />
                    : <FileIcon className="h-3.5 w-3.5" aria-hidden />}
                </span>
                <span className="skill-tree-name">
                  <span className="skill-tree-label" title={rule.path}>{rule.label}</span>
                  {rule.symlinkTarget != null ? <LinkIcon className="skill-tree-link h-3 w-3" aria-label="Verweis" /> : null}
                </span>
              </div>
            ))}
        </TreeGroup>
      )}

      {(!searching || skills.length > 0) && (
        <TreeGroup id="skills" title="Skills" count={skills.length} addLabel="Neuen Skill anlegen" onAdd={onCreate} forceOpen={searching && skills.length > 0}>
          {skills.length === 0 && !searching
            ? <p className="skill-tree-empty">Noch keine Skills vorhanden.</p>
            : skills.map((skill) => (
              <SkillBranch key={skill.path} skill={skill} scope="skills" selectedPath={selectedPath} onSelect={onSelect} onRename={onRename} onDelete={onDelete} forceOpen={searching} />
            ))}
        </TreeGroup>
      )}

      {(!searching || hermes.length > 0) && (
        <TreeGroup
          id="hermes"
          title="Hermes-Skills"
          count={hermes.length}
          addLabel="Hermes-Skill anlegen"
          onAdd={onCreateHermes}
          forceOpen={searching && hermes.length > 0}
        >
          {hermes.length === 0 && !searching
            ? <p className="skill-tree-empty">Noch keine Hermes-Skills vorhanden.</p>
            : hermesGroups.map((group) => (
              <div key={group.category}>
                <p className="skill-tree-section">{group.category}</p>
                {group.skills.map((skill) => (
                  <SkillBranch key={skill.path} skill={skill} scope="hermes" selectedPath={selectedPath} onSelect={onSelect} onRename={onRename} onDelete={onDelete} forceOpen={searching} />
                ))}
              </div>
            ))}
        </TreeGroup>
      )}

      {nothingFound ? <p className="skill-tree-empty">Kein Skill passt auf „{query.trim()}“.</p> : null}
    </nav>
  );
}
