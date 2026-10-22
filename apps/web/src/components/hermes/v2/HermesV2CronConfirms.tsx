import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../ModalDialog";
import type { HermesV2CronJob } from "@wrapt/contracts/hermes-v2";
import type { HermesV2Resources, ResourceConfirmation } from "./resource-types";

/**
 * Run/Delete bestätigen an konkrete Job-ID plus Fresche des Details. Nur die
 * von diesem Dialog ausgelöste Aktion entscheidet über Schließen und
 * Fehleranzeige; alte Quittungen gehen nicht ein. Doppelklick verriegelt der
 * ConfirmDialog selbst.
 */
interface ActionLike {
  key: string;
  operation: string;
  targetId: string | null;
  status: "pending" | "confirmed" | "not_sent" | "rejected" | "unknown";
  error: { message: string } | null;
}

function useBoundOutcome(
  enabled: boolean,
  operation: "cron.run" | "cron.delete",
  targetId: string,
  actions: readonly ActionLike[],
): { status: ActionLike["status"]; message: string | null } | null {
  // Baseline gilt ab Aktivierung; spätere Renders überschreiben sie nicht.
  const baseline = useRef<Set<string> | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [boundKey, setBoundKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      baseline.current = null;
      setBoundKey(null);
      return;
    }
    baseline.current = new Set(
      actionsRef.current
        .filter((action) => action.operation === operation && action.targetId === targetId)
        .map((action) => action.key),
    );
  }, [enabled, operation, targetId]);

  useEffect(() => {
    if (!enabled || boundKey !== null || baseline.current === null) return;
    const fresh = actionsRef.current.find(
      (action) =>
        !baseline.current?.has(action.key) &&
        action.operation === operation &&
        action.targetId === targetId,
    );
    if (fresh) setBoundKey(fresh.key);
  }, [enabled, boundKey, actions, operation, targetId]);

  if (!enabled || boundKey === null) return null;
  const view = actions.find((action) => action.key === boundKey);
  if (!view) return null;
  return {
    status: view.status,
    message:
      view.status === "confirmed" || view.status === "pending"
        ? null
        : (view.error?.message ?? "Ausgang unklar."),
  };
}

function outcomeText(
  outcome: { status: ActionLike["status"]; message: string | null } | null,
): string | null {
  if (!outcome) return null;
  if (outcome.status === "confirmed" || outcome.status === "pending") return null;
  if (outcome.status === "not_sent") return `${outcome.message} Ausgeführt wurde nichts.`;
  if (outcome.status === "rejected") return `${outcome.message} Der Vorgang wurde abgelehnt.`;
  return `${outcome.message} Ausgang unklar: erst fertig neu lesen, dann bewusst wieder versuchen.`;
}

function CronConfirmDialog({
  resources,
  job,
  operation,
  title,
  description,
  confirmLabel,
  danger,
  onClose,
}: {
  resources: HermesV2Resources;
  job: HermesV2CronJob;
  operation: "run" | "delete";
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
  onClose: () => void;
}) {
  const [confirmation, setConfirmation] = useState<ResourceConfirmation | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const prepareRef = useRef(resources.prepareCronConfirmation);
  prepareRef.current = resources.prepareCronConfirmation;
  useEffect(() => {
    // Bestätigung einmalig je Dialog; das Detail muss dafür frisch geladen sein.
    const token = prepareRef.current(operation);
    if (!token) {
      setPrepareError("Keine frische Bestätigung möglich. Job-Auswahl neu laden.");
      return;
    }
    setConfirmation(token);
  }, [operation]);
  const operationAction = operation === "run" ? "cron.run" : "cron.delete";
  const outcome = useBoundOutcome(
    confirmation !== null,
    operationAction,
    job.id,
    resources.actions,
  );
  useEffect(() => {
    if (outcome?.status === "confirmed") onClose();
  }, [outcome, onClose]);
  const confirm = () => {
    if (!confirmation) return;
    setPending(true);
    const promise =
      operation === "run"
        ? resources.runCron(confirmation)
        : resources.deleteCron(confirmation);
    void promise.finally(() => setPending(false));
  };
  return (
    <ConfirmDialog
      open
      className="hermesv2-cron-confirm"
      title={title}
      description={description}
      confirmLabel={prepareError ? "Bestätigung fehlt" : confirmLabel}
      danger={danger}
      confirmPending={pending}
      error={prepareError ?? outcomeText(outcome)}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}

export function HermesV2CronRunConfirm({
  resources,
  job,
  onClose,
}: {
  resources: HermesV2Resources;
  job: HermesV2CronJob;
  onClose: () => void;
}) {
  const pausedHint =
    job.paused === true
      ? " Der Job ist pausiert. Das native Ausführen kann ihn wieder aktivieren und reservieren."
      : job.paused === null
        ? " Pausenzustand ist unbekannt."
        : "";
  return (
    <CronConfirmDialog
      resources={resources}
      job={job}
      operation="run"
      title="Cron-Job ausführen"
      description={`Startet ${job.name || job.id} (${job.id}) jetzt nativ in Hermes.${pausedHint} Ein Einmallauf kann nach der Quittung verschwunden sein.`}
      confirmLabel="Ausführen"
      danger={false}
      onClose={onClose}
    />
  );
}

export function HermesV2CronDeleteConfirm({
  resources,
  job,
  onClose,
}: {
  resources: HermesV2Resources;
  job: HermesV2CronJob;
  onClose: () => void;
}) {
  return (
    <CronConfirmDialog
      resources={resources}
      job={job}
      operation="delete"
      title="Cron-Job löschen"
      description={`Löscht ${job.name || job.id} (${job.id}) endgültig nativ in Hermes. Ein One-shot kann sich nach dem Lauf selbst entfernen; die Löschung selbst bestätigt nur diesen konkreten Job.`}
      confirmLabel="Löschen"
      danger
      onClose={onClose}
    />
  );
}
