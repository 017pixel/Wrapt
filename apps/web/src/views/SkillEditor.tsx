import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SkillEditorCreateResponse, SkillEditorFile, SkillEditorGitResponse, SkillEditorNode, SkillEditorTreeResponse } from "@wrapt/contracts";
import { apiClient } from "../lib/apiClient";
import {
  createHermesSkillSafe,
  deleteSkillScoped,
  firstSkillFilePath,
  renameSkillScoped,
  skillForPath,
  skillFrontmatterWarnings,
  useAutosave,
  type SkillScope,
} from "../lib/skillEditor";
import { useResponsiveShell } from "../lib/useResponsiveShell";
import { usePaneWidth } from "../lib/usePaneWidth";
import { AutosaveStatus } from "../components/skillEditor/AutosaveStatus";
import { MarkdownEditor } from "../components/skillEditor/MarkdownEditor";
import { NewSkillDialog } from "../components/skillEditor/NewSkillDialog";
import { SkillGitBar } from "../components/skillEditor/SkillGitBar";
import { SkillTree } from "../components/skillEditor/SkillTree";
import { ConfirmDialog, PromptDialog } from "../components/ModalDialog";
import { CloseIcon, FolderTreeIcon, SearchIcon } from "../components/icons";

const treeQueryKey = ["skills", "tree"] as const;
const statusQueryKey = ["skills", "status"] as const;

export function SkillEditor() {
  const queryClient = useQueryClient();
  const responsive = useResponsiveShell();
  const compact = responsive.isTouchShell;

  const status = useQuery({ queryKey: statusQueryKey, queryFn: ({ signal }) => apiClient.skillEditorStatus(signal), staleTime: 10_000 });
  const tree = useQuery({ queryKey: treeQueryKey, queryFn: ({ signal }) => apiClient.skillEditorTree(signal), staleTime: 10_000 });

  // Backend-Track-Felder (ruleEntries, hermesSkills) — bei alten Ständen ohne
  // die Felder greift der Baum auf agentsFile zurück, hier mit ?? [] defensiv.
  // Eigene Memos, damit die Referenz bei jedem Render stabil bleibt.
  const ruleEntries = useMemo(() => tree.data?.ruleEntries ?? [], [tree.data]);
  const hermesSkills = useMemo(() => tree.data?.hermesSkills ?? [], [tree.data]);
  const hermesCategories = useMemo(
    () => [...new Set(hermesSkills.map((skill) => skill.category))].sort((a, b) => a.localeCompare(b, "de")),
    [hermesSkills],
  );
  const allSkills = useMemo<SkillEditorNode[]>(
    () => [...(tree.data?.skills ?? []), ...hermesSkills],
    [hermesSkills, tree.data?.skills],
  );

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeQuery, setTreeQuery] = useState("");
  const treePaneWidth = usePaneWidth({ storageKey: "wrapt.skills.tree-width.v1", initial: 280, min: 200, max: 460 });
  const [creating, setCreating] = useState(false);
  const [creatingHermes, setCreatingHermes] = useState(false);
  const [renaming, setRenaming] = useState<{ node: SkillEditorNode; scope: SkillScope } | null>(null);
  const [deleting, setDeleting] = useState<{ node: SkillEditorNode; scope: SkillScope } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [gitResult, setGitResult] = useState<SkillEditorGitResponse | null>(null);

  // Ohne Auswahl stehen die globalen Regeln im Editor — der häufigste Einstieg.
  // Fehlende Dateien (editable false ohne Ziel) werden übersprungen, damit
  // kein 404-Fallback im Editor landet.
  const firstOpenPath = useCallback(() => ruleEntries.find((rule) => rule.editable)?.path
    ?? (tree.data?.agentsFile?.editable ? tree.data.agentsFile.path : null)
    ?? firstSkillFilePath(tree.data?.skills.find((skill) => !skill.broken))
    ?? firstSkillFilePath(hermesSkills.find((skill) => !skill.broken))
    ?? null, [hermesSkills, ruleEntries, tree.data]);
  useEffect(() => {
    if (selectedPath !== null || !tree.data) return;
    setSelectedPath(firstOpenPath());
  }, [firstOpenPath, selectedPath, tree.data]);

  const file = useQuery({
    queryKey: ["skills", "file", selectedPath],
    queryFn: ({ signal }) => apiClient.skillEditorRead(selectedPath!, signal),
    enabled: selectedPath !== null,
    staleTime: Infinity,
    retry: false,
  });

  const autosave = useAutosave({
    file: file.data ?? null,
    debounceMs: status.data?.autosaveDebounceMs ?? 2_500,
    onSaved: useCallback((saved) => {
      queryClient.setQueryData(["skills", "file", saved.path], saved);
      void queryClient.invalidateQueries({ queryKey: statusQueryKey });
    }, [queryClient]),
  });

  const activeSkill = useMemo(() => skillForPath(allSkills, selectedPath), [selectedPath, allSkills]);
  const warnings = useMemo(
    () => (selectedPath?.endsWith("/SKILL.md") ? skillFrontmatterWarnings(autosave.content, activeSkill?.name ?? null) : []),
    [activeSkill?.name, autosave.content, selectedPath],
  );

  const refreshTree = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: treeQueryKey }),
      queryClient.invalidateQueries({ queryKey: statusQueryKey }),
    ]);
  }, [queryClient]);

  const openFile = useCallback(async (entry: SkillEditorFile) => {
    if (entry.path === selectedPath) return;
    // Erst den offenen Stand sichern, dann wechseln — sonst geht die Tippause verloren.
    await autosave.flush();
    setSelectedPath(entry.path);
    if (compact) setTreeOpen(false);
  }, [autosave, compact, selectedPath]);

  const applyResult = useCallback(async (result: SkillEditorCreateResponse, verb: string) => {
    await refreshTree();
    setSelectedPath(result.path);
    const parts = [`Skill „${result.name}" ${verb}.`];
    if (result.propagated.length > 0) parts.push(`An ${result.propagated.length} Ziel${result.propagated.length === 1 ? "" : "e"} verteilt.`);
    if (result.notice) parts.push(result.notice);
    else if (result.readmeUpdated) parts.push("README aktualisiert.");
    setActionMessage({ tone: "ok", text: parts.join(" ") });
  }, [refreshTree]);

  const failed = useCallback((error: unknown) => {
    setActionMessage({ tone: "bad", text: error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen." });
  }, []);

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description: string; license?: string }) => apiClient.createSkill(input),
    onSuccess: (result) => { if (result) void applyResult(result, "angelegt"); },
    onError: failed,
  });
  const createHermesMutation = useMutation({
    mutationFn: (input: { name: string; description: string; category: string; license?: string }) => createHermesSkillSafe(input),
    onSuccess: (result) => { if (result) void applyResult(result, "angelegt"); },
    onError: failed,
  });
  const renameMutation = useMutation({
    mutationFn: (input: { name: string; newName: string; scope: SkillScope }) => renameSkillScoped(input.name, input.newName, input.scope),
    onSuccess: (result) => { if (result) void applyResult(result, "umbenannt"); },
    onError: failed,
  });
  const deleteMutation = useMutation({
    mutationFn: (input: { name: string; scope: SkillScope }) => deleteSkillScoped(input.name, input.scope),
    onSuccess: async (_result, input) => {
      // Erst Auswahl lösen (kein 404 auf die gelöschte Datei), dann aus den
      // frischen Baumdaten wählen statt aus dem Stand vor dem Löschen.
      setSelectedPath(null);
      await refreshTree();
      const fresh = queryClient.getQueryData<SkillEditorTreeResponse>(treeQueryKey);
      setSelectedPath(
        fresh?.ruleEntries?.find((rule) => rule.editable)?.path
          ?? (fresh?.agentsFile?.editable ? fresh.agentsFile.path : null)
          ?? firstSkillFilePath(fresh?.skills.find((skill) => !skill.broken))
          ?? firstSkillFilePath(fresh?.hermesSkills?.find((skill) => !skill.broken))
          ?? null,
      );
      setActionMessage({ tone: "ok", text: `Skill „${input.name}" samt Verweisen entfernt.` });
      setDeleting(null);
    },
    onError: failed,
  });
  const previewMutation = useMutation({
    mutationFn: () => apiClient.skillGitPreview(),
    onError: failed,
  });
  const commitMutation = useMutation({
    mutationFn: (intent: string) => apiClient.commitSkills(intent),
    onSuccess: async (result) => {
      setGitResult(result ?? null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: statusQueryKey }), refreshTree()]);
    },
    onError: failed,
  });
  const pushMutation = useMutation({
    mutationFn: () => apiClient.pushSkills(),
    onSuccess: async (result) => {
      setGitResult(result ?? null);
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
    },
    onError: failed,
  });

  // Ein Knopf für alles: Vorschau prüfen, committen, pushen. Leere Vorschau
  // bricht still ab, Fehler landen über die Mutationen in der Leiste.
  const commitAndPush = useCallback(() => {
    if (previewMutation.isPending || commitMutation.isPending || pushMutation.isPending) return;
    void (async () => {
      const preview = await previewMutation.mutateAsync();
      if (!preview || preview.paths.length === 0) return;
      const committed = await commitMutation.mutateAsync(preview.intent);
      if (!committed) return;
      await pushMutation.mutateAsync();
    })().catch(failed);
  }, [commitMutation, failed, previewMutation, pushMutation]);

  const handleRename = useCallback((node: SkillEditorNode, scope: SkillScope = "skills") => {
    setRenaming({ node, scope });
  }, []);
  const handleDelete = useCallback((node: SkillEditorNode, scope: SkillScope = "skills") => {
    setDeleting({ node, scope });
  }, []);

  const readError = file.isError ? (file.error instanceof Error ? file.error.message : "Die Datei konnte nicht geladen werden.") : null;

  const treePane = (
    <aside
      className={`skill-editor-tree-pane ${compact ? "is-drawer" : ""} ${treeOpen ? "is-open" : ""}`}
      style={compact ? undefined : { width: `${treePaneWidth.width}px` }}
    >
      {/* Bei über dreißig Skills ist Scrollen der langsamste Weg zum Ziel. */}
      <label className="skill-editor-tree-search" title="Skills filtern">
        <SearchIcon className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Skills filtern</span>
        <input value={treeQuery} onChange={(event) => setTreeQuery(event.target.value)} placeholder="Skill suchen" spellCheck={false} />
        {treeQuery ? <button type="button" onClick={() => setTreeQuery("")} aria-label="Filter leeren"><CloseIcon className="h-3 w-3" /></button> : null}
      </label>
      {tree.isLoading ? <div className="file-manager-tree-skeleton"><span /><span /><span /><span /></div>
        : tree.isError ? <p className="file-manager-tree-error">Der Skill-Ordner konnte nicht gelesen werden.</p>
          : tree.data ? (
            <SkillTree
              tree={tree.data}
              selectedPath={selectedPath}
              onSelect={(entry) => void openFile(entry)}
              onCreate={() => setCreating(true)}
              onCreateHermes={() => setCreatingHermes(true)}
              onRename={handleRename}
              onDelete={handleDelete}
              query={treeQuery}
            />
          ) : null}
      {!compact ? <div
        className="pane-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Breite des Skill-Baums anpassen"
        aria-valuenow={treePaneWidth.width}
        aria-valuemin={treePaneWidth.min}
        aria-valuemax={treePaneWidth.max}
        tabIndex={0}
        onPointerDown={treePaneWidth.startResize}
        onKeyDown={treePaneWidth.resizeWithKeyboard}
      /> : null}
    </aside>
  );

  return (
    <div className="app-surface skill-editor-page">
      <div className={`app-surface-body skill-editor ${compact ? "is-compact" : ""}`}>
          {treePane}
          {compact && treeOpen ? <button type="button" className="app-surface-scrim" aria-label="Baum schließen" onClick={() => setTreeOpen(false)} /> : null}

          <section className="skill-editor-main">
            <header className="skill-editor-head">
              {compact ? (
                <button type="button" className="quiet-button skill-editor-tree-trigger" onClick={() => setTreeOpen(true)}>
                  <FolderTreeIcon className="h-3.5 w-3.5" /> Skills
                </button>
              ) : null}
              <span className="skill-editor-title">
                <span className="skill-editor-file-name">{file.data?.name ?? "Keine Datei gewählt"}</span>
                <span className="skill-editor-file-path" title={selectedPath ?? ""}>{activeSkill ? activeSkill.name : selectedPath ? "Globale Regeln" : ""}</span>
              </span>
              {file.data ? <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} /> : null}
            </header>

            {autosave.state.kind === "conflict" ? (
              <div className="skill-editor-alert is-bad" role="alert">
                <span>Diese Datei wurde außerhalb von Wrapt geändert.</span>
                <span className="skill-editor-alert-actions">
                  <button type="button" className="quiet-button" onClick={() => void autosave.overwrite()}>Überschreiben</button>
                  <button type="button" className="quiet-button" onClick={() => void autosave.reload()}>Neu laden</button>
                </span>
              </div>
            ) : null}

            {actionMessage ? (
              <div className={`skill-editor-alert ${actionMessage.tone === "bad" ? "is-bad" : "is-ok"}`} role="status">
                <span>{actionMessage.text}</span>
                <button type="button" className="icon-button" onClick={() => setActionMessage(null)} aria-label="Hinweis schließen">
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {readError ? <p className="skill-editor-empty">{readError}</p>
              : file.isLoading ? <div className="file-manager-tree-skeleton"><span /><span /><span /><span /></div>
                : file.data ? (
                  <MarkdownEditor
                    value={autosave.content}
                    onChange={autosave.setContent}
                    onBlur={() => void autosave.flush()}
                    warnings={warnings}
                  />
                ) : (
                  <div className="skill-editor-empty">
                    <strong>Keine Datei geöffnet</strong>
                    <p>Globale Agenten-Regeln und Skills liegen direkt auf dem Server. Änderungen werden automatisch gespeichert, auch beim Schließen der Seite.</p>
                    <button type="button" className="quiet-button" onClick={() => setTreeOpen(true)}><FolderTreeIcon className="h-3.5 w-3.5" /> Skill auswählen</button>
                  </div>
                )}
          </section>
      </div>

      {status.data?.repositoryConfigured ? (
        <SkillGitBar
          repository={status.data.repository}
          result={gitResult}
          busy={previewMutation.isPending || commitMutation.isPending || pushMutation.isPending}
          onCommitAndPush={commitAndPush}
        />
      ) : null}

      <NewSkillDialog
        open={creating}
        busy={createMutation.isPending}
        mode="skills"
        onClose={() => setCreating(false)}
        onCreate={(input) => createMutation.mutate(input)}
      />
      <NewSkillDialog
        open={creatingHermes}
        busy={createHermesMutation.isPending}
        mode="hermes"
        categories={hermesCategories}
        onClose={() => setCreatingHermes(false)}
        onCreate={(input) => {
          if (!input.category) { failed(new Error("Bitte eine Kategorie wählen oder neu tippen.")); return; }
          createHermesMutation.mutate({ name: input.name, description: input.description, category: input.category, ...(input.license ? { license: input.license } : {}) });
        }}
      />
      <PromptDialog
        open={renaming !== null}
        title={renaming?.scope === "hermes" ? "Hermes-Skill umbenennen" : "Skill umbenennen"}
        description="Ordner, alle Verweise und der Frontmatter-Name werden mit umbenannt."
        label="Neuer Name"
        initialValue={renaming?.node.name ?? ""}
        confirmLabel="Umbenennen"
        onConfirm={(value) => { if (renaming) renameMutation.mutate({ name: renaming.node.name, newName: value, scope: renaming.scope }); }}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`${deleting?.scope === "hermes" ? "Hermes-Skill" : "Skill"} „${deleting?.node.name ?? ""}" löschen`}
        description="Der Skill-Ordner, alle Verweise in den Harness-Verzeichnissen und die README-Zeile werden entfernt. Das lässt sich nur über Git zurückholen."
        confirmLabel={deleteMutation.isPending ? "Wird gelöscht …" : "Endgültig löschen"}
        danger
        confirmPending={deleteMutation.isPending}
        error={deleting && deleteMutation.error instanceof Error ? deleteMutation.error.message : null}
        onConfirm={() => { if (deleting) deleteMutation.mutate({ name: deleting.node.name, scope: deleting.scope }); }}
        onClose={() => { deleteMutation.reset(); setDeleting(null); }}
      />
    </div>
  );
}
