import { useEffect, useMemo, useRef, useState } from "react";
import { ModalFrame } from "../../ModalDialog";
import { projectsApi } from "../../../lib/apiClient/projects";
import type { HermesV2CronJob } from "@wrapt/contracts/hermes-v2";
import type { HermesV2Resources } from "./resource-types";
import { SCHEDULE_HINT } from "./cron-format";
import { cronUpdates, draftFromJob, NO_PROJECT, type CronFieldKey, type FormDraft } from "./cron-form-state";
import "./hermes-v2-cron.css";

export type CronFormMode =
  | { mode: "create" }
  | { mode: "edit"; jobId: string };

function targetKey(target: CronFormMode): string {
  return target.mode === "edit" ? `edit:${target.jobId}` : "create";
}

/**
 * Create/Edit eines nativen Cron-Jobs mit ausschließlich freigegebenen
 * Feldern. Bearbeiten sendet nur vom User berührte Felder: ein im Hintergrund
 * nativ geänderter Name bleibt frisch, das Prompt-Draft geht trotzdem nicht
 * verloren, und die Projektbindung wird nur ausdrücklich verändert. Fehler
 * behalten die Formulardaten; der echte Fehler kommt aus dem Clientviewmodel,
 * kein Autoretry.
 */
export function HermesV2CronForm({
  resources,
  target,
  initial: suppliedInitial,
  open,
  onClose,
}: {
  resources: HermesV2Resources;
  target: CronFormMode;
  initial: HermesV2CronJob | null;
  open: boolean;
  onClose: () => void;
}) {
  const key = targetKey(target);
  const initial = target.mode === "edit" && suppliedInitial?.id === target.jobId ? suppliedInitial : null;
  const jobRef = useRef(initial);
  jobRef.current = initial;
  const [draft, setDraft] = useState<FormDraft>(() => draftFromJob(initial));
  const [touched, setTouched] = useState<ReadonlySet<CronFieldKey>>(new Set());
  const prefilledRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<{
    state: "loading" | "ready" | "error";
    items: Array<{ id: string; name: string }>;
  }>({ state: "loading", items: [] });
  const [submitting, setSubmitting] = useState(false);
  // Nur eine neue Quittung des tatsächlich gestarteten Versuchs schließt das Formular.
  const baselineKeys = useRef<Set<string>>(new Set());
  const boundActionKey = useRef<string | null>(null);
  const submission = useRef<object | null>(null);
  const attempted = useRef(false);

  // Pro Öffnung/Ziel: neue Bestätigungsbasis und leerer Berührungsstand;
  // Create füllt einmalig leer vor, Edit wartet auf die native Basis.
  useEffect(() => {
    if (!open) return;
    baselineKeys.current = new Set(resources.actions.map((action) => action.key));
    boundActionKey.current = null;
    submission.current = null;
    attempted.current = false;
    setSubmitting(false);
    setTouched(new Set());
    if (key === "create") {
      setDraft(draftFromJob(null));
      prefilledRef.current = key;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  // Erstes Ankommen der nativen Basis in Bearbeiten: einmalig vorfüllen.
  useEffect(() => {
    if (!open || key === "create" || prefilledRef.current === key) return;
    const current = jobRef.current;
    if (current) {
      setDraft(draftFromJob(current));
      prefilledRef.current = key;
    }
  }, [open, key]);

  // Berührte Felder bleiben beim Refresh stehen, unberührte folgen nativ.
  useEffect(() => {
    if (target.mode !== "edit" || !initial) return;
    setDraft((prev) => ({
      name: touched.has("name") ? prev.name : (initial.name ?? ""),
      prompt: touched.has("prompt") ? prev.prompt : (initial.prompt ?? ""),
      schedule: touched.has("schedule") ? prev.schedule : (initial.schedule ?? ""),
      repeat: touched.has("repeat")
        ? prev.repeat
        : initial.repeat === null
          ? ""
          : String(initial.repeat),
      paused: touched.has("paused") ? prev.paused : (initial.paused ?? false),
      projectId: touched.has("projectId") ? prev.projectId : null,
    }));
  }, [initial, touched, target.mode]);

  // Nach dem Abschluss ehrlich an der konkreten Aktion ausrichten.
  useEffect(() => {
    if (!open || !attempted.current) return;
    if (boundActionKey.current === null) {
      const fresh = resources.actions.find(
        (action) =>
          !baselineKeys.current.has(action.key) &&
          ((key === "create" && action.operation === "cron.create") ||
            (key !== "create" && action.operation === "cron.update" &&
              action.targetId === key.slice("edit:".length))),
      );
      if (fresh) boundActionKey.current = fresh.key;
    }
    if (boundActionKey.current === null) return;
    const bound = resources.actions.find(
      (action) => action.key === boundActionKey.current,
    );
    if (!bound) return;
    if (bound.status === "confirmed") onClose();
  }, [open, resources.actions, key, onClose]);

  // Projektliste über das bestehende Wrapt-Angebot; der Server
  // löst die Projekt-ID gegenüber dem nativen CWD auf.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setProjects({ state: "loading", items: [] });
    projectsApi
      .projects(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setProjects({ state: "ready", items: response.projects });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setProjects({ state: "error", items: [] });
      });
    return () => controller.abort();
  }, [open]);

  const actionError = resources.actionError;
  const busy =
    target.mode === "edit" &&
    resources.actions.some(
      (action) => action.targetId === target.jobId && action.status === "pending",
    );
  const updates = useMemo(() => target.mode === "edit" && initial
    ? cronUpdates(initial, draft, touched) : null, [target.mode, initial, draft, touched]);
  const submitDisabled =
    !resources.available ||
    submitting ||
    busy ||
    (target.mode === "create" && draft.schedule.trim() === "") ||
    (target.mode === "edit" && (!updates || Object.keys(updates).length === 0));

  const markTouched = (field: CronFieldKey) => {
    setTouched((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };

  const submit = () => {
    if (submission.current || submitDisabled) return;
    const token = {};
    submission.current = token;
    attempted.current = true;
    baselineKeys.current = new Set(resources.actions.map((action) => action.key));
    boundActionKey.current = null;
    setSubmitting(true);
    const promise =
      target.mode === "edit"
        ? resources.updateCron(target.jobId, updates ?? {})
        : resources.createCron({
            name: draft.name.trim(),
            prompt: draft.prompt,
            schedule: draft.schedule.trim(),
            repeat: draft.repeat.trim() === "" ? null : draft.repeat.trim(),
            paused: draft.paused,
            projectId: draft.projectId === NO_PROJECT ? null : draft.projectId ?? null,
          });
    void promise.catch(() => {}).finally(() => {
      if (submission.current !== token) return;
      submission.current = null;
      setSubmitting(false);
    });
  };

  return (
    <ModalFrame
      open={open}
      title={target.mode === "edit" ? "Cron-Job bearbeiten" : "Neuen Cron-Job erstellen"}
      onClose={onClose}
    >
      {() => (
        <form
          className="hermesv2-cron-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!submitDisabled) submit();
          }}
        >
          <label className="hermesv2-field">
            <span>Name</span>
            <input
              type="text"
              className="hermesv2-input"
              value={draft.name}
              onChange={(event) => {
                markTouched("name");
                setDraft({ ...draft, name: event.target.value });
              }}
              placeholder="z. B. Nächtliche Zusammenfassung"
            />
          </label>
          <label className="hermesv2-field">
            <span>Prompt</span>
            <textarea
              className="hermesv2-input hermesv2-cron-prompt"
              value={draft.prompt}
              onChange={(event) => {
                markTouched("prompt");
                setDraft({ ...draft, prompt: event.target.value });
              }}
              rows={4}
            />
          </label>
          <div className="hermesv2-field">
            <label>
              <span>Schedule</span>
              <input
                type="text"
                className="hermesv2-input"
                value={draft.schedule}
                onChange={(event) => {
                  markTouched("schedule");
                  setDraft({ ...draft, schedule: event.target.value });
                }}
                placeholder="every 30m"
                required={target.mode === "create"}
              />
            </label>
            <p className="hermesv2-field-hint">{SCHEDULE_HINT}</p>
          </div>
          <div className="hermesv2-field">
            <label>
              <span>Wiederholung</span>
              <input
                type="text"
                className="hermesv2-input"
                value={draft.repeat}
                onChange={(event) => {
                  markTouched("repeat");
                  setDraft({ ...draft, repeat: event.target.value });
                }}
                placeholder="Zahl, once oder forever"
              />
            </label>
            <p className="hermesv2-field-hint">Leer bedeutet keine native Angabe.</p>
          </div>
          <div className="hermesv2-field">
            <label>
              <span>Projekt</span>
              {projects.state === "loading" ? (
                <p className="hermesv2-resource-status">Projektliste wird geladen…</p>
              ) : projects.state === "error" ? (
                <p className="hermesv2-resource-status" role="status">
                  Projektliste konnte nicht geladen werden. Ohne Projekt
                  fortsetzen und die Liste später erneut öffnen.
                </p>
              ) : (
                <select
                  className="hermesv2-input"
                  value={draft.projectId ?? NO_PROJECT}
                  onChange={(event) => {
                    markTouched("projectId");
                    setDraft({ ...draft, projectId: event.target.value });
                  }}
                >
                  <option value={NO_PROJECT}>Ohne Projekt</option>
                  {projects.items.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {target.mode === "edit" ? (
              <p className="hermesv2-field-hint">
                Solange nichts gewählt wird, bleibt eine im Job nativ gesetzte
                Projektbindung unverändert.
              </p>
            ) : null}
          </div>
          <label className="hermesv2-check">
            <input
              type="checkbox"
              checked={draft.paused}
              onChange={(event) => {
                markTouched("paused");
                setDraft({ ...draft, paused: event.target.checked });
              }}
            />
            <span>Erst einmal pausiert anlegen</span>
          </label>
          {target.mode === "edit" && initial && !initial.valid ? (
            <p className="hermesv2-resource-note" role="status">
              Dieser Job gilt nativ nicht als vollständig; Änderungen lassen
              native Zusatzfelder unverändert.
            </p>
          ) : null}
          {target.mode === "edit" && updates && Object.keys(updates).length === 0 ? (
            <p className="hermesv2-resource-status">
              Keine Änderungen gegenüber dem nativen Stand.
            </p>
          ) : null}
          {actionError ? (
            <div className="hermesv2-resource-error" role="alert">
              <p>{actionError.message}</p>
              <p className="hermesv2-action-outcome">
                {actionError.outcome === "not_sent"
                  ? "Ausgeführt wurde nichts."
                  : actionError.outcome === "rejected"
                    ? "Der Vorgang wurde abgelehnt."
                    : "Ausgang unklar: erst fertig neu lesen, dann bewusst wieder versuchen."}
              </p>
            </div>
          ) : null}
          <div className="hermesv2-form-actions">
            <button type="button" className="quiet-button" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="submit"
              className="quiet-button-primary"
              disabled={submitDisabled}
            >
              {submitting
                ? "Sendet…"
                : target.mode === "edit"
                  ? "Änderungen senden"
                  : "Erstellen"}
            </button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
