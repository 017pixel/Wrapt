import { useEffect, useRef, useState } from "react";
import { ModalFrame } from "../../ModalDialog";
import type { HermesV2Resources, ResourceConfirmation } from "./resource-types";
import "./hermes-v2-resources.css";

/**
 * Löschbestätigung mit echter Nativsemantik. Die Bestätigung bindet die
 * exakte ID plus die vom Clientvertrag geforderte Referenz. Der Text nennt
 * vor dem Senden ausdrücklich die Kompressionskette samt delegierter
 * Unteraufgaben und hält eigenständige Branch- und Resetgespräche
 * heraus. 409 und unknown bleiben sichtbar; keine optimistische Entfernung,
 * der Client bereinigt nur konkret bestätigte IDs.
 */
export function HermesV2SessionDeleteSheet({
  resources,
  sessionId,
  onClose,
}: {
  resources: HermesV2Resources;
  sessionId: string;
  onClose: () => void;
}) {
  const preview = resources.sessionDeletion;
  const data = preview.data;
  const deletable = data?.deletable === true;
  const [token, setToken] = useState<ResourceConfirmation | null>(null);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const prepareRef = useRef(resources.prepareSessionDeletion);
  prepareRef.current = resources.prepareSessionDeletion;

  // Neu bestätigen an jedem frischen Preview-Beleg; Scopewechsel zwingt dazu.
  useEffect(() => {
    if (!deletable) {
      setToken(null);
      setPrepareNote(null);
      return;
    }
    const prepared = prepareRef.current();
    if (!prepared) {
      setToken(null);
      setPrepareNote("Keine frische Bestätigung möglich. Auswahl neu öffnen.");
      return;
    }
    setToken(prepared);
    setPrepareNote(null);
  }, [deletable, data?.scope]);

  const bound = resources.actions
    .filter(
      (action) =>
        action.operation === "session.delete" && action.targetId === sessionId,
    )
    .at(-1) ?? null;
  const unknownLocked = bound !== null && bound.status === "unknown" && !bound.reconciled;
  const errorLine =
    bound && bound.status !== "pending" && bound.status !== "confirmed"
      ? (bound.error?.message ?? "Ausgang unklar.")
      : null;
  const outcomeLine =
    bound && bound.status !== "pending" && bound.status !== "confirmed"
      ? bound.status === "not_sent"
        ? "Ausgeführt wurde nichts."
        : bound.status === "rejected"
          ? "Der Vorgang wurde abgelehnt."
          : "Ausgang unklar: erst fertig neu lesen, dann bewusst wieder versuchen."
      : null;
  const targetTitle = data?.title || sessionId;
  const confirmed = bound?.status === "confirmed";

  const confirmDelete = () => {
    if (!token || pending || unknownLocked) return;
    setPending(true);
    void resources.deleteSession(token).finally(() => setPending(false));
  };

  return (
    <ModalFrame
      open
      title={confirmed ? "Sitzung gelöscht" : `Sitzung löschen: ${targetTitle}`}
      onClose={onClose}
      description={confirmed ? undefined : "Löscht die Sitzung nativ in Hermes; Abbrechen sendet nichts."}
    >
      {() => (
        <div className="hermesv2-delete">
          <p className="hermesv2-resource-status" role="status">
            Vorgang: <span data-hermes-delete-session={sessionId}>{sessionId}</span>
          </p>
          {confirmed ? (
            <div className="hermesv2-delete-confirmed">
              <p className="hermesv2-resource-note" role="status">
                Löschung nativ bestätigt. Der Client liest den Katalog nach
                den bestätigten IDs neu; eine Vollständigkeit der betroffenen
                Liste ist ausdrücklich nicht belegt.
              </p>
              <div className="hermesv2-form-actions">
                <button
                  type="button"
                  className="quiet-button-primary"
                  onClick={onClose}
                >
                  Fertig
                </button>
              </div>
            </div>
          ) : (
            <>
              {preview.status === "loading" ? (
                <p className="hermesv2-resource-status" role="status">
                  Vorschau wird geladen…
                </p>
              ) : null}
              {preview.status === "idle" ? (
                <p className="hermesv2-resource-status" role="status">
                  Vorschau noch nicht geladen.
                </p>
              ) : null}
              {preview.status === "missing" ? (
                <p className="hermesv2-resource-status" role="status">
                  Keine gültige Vorschau für diese Kennung; der Vorgang sendet nichts.
                </p>
              ) : null}
              {preview.status === "error" && preview.error ? (
                <div className="hermesv2-resource-error" role="alert">
                  <p>{preview.error.message}</p>
                  <p className="hermesv2-action-outcome">
                    {preview.error.outcome === "not_sent"
                      ? "Ausgeführt wurde nichts."
                      : preview.error.outcome === "rejected"
                        ? "Der Vorgang wurde nativ abgelehnt."
                        : "Ausgang unklar: erst fertig neu lesen, dann bewusst wieder versuchen."}
                  </p>
                </div>
              ) : null}
              {data && !data.deletable ? (
                <p className="hermesv2-resource-note" role="status">
                  Löschen ist nativ gesperrt: {data.reason ?? "Grund unbekannt"}.
                </p>
              ) : null}
              {deletable ? (<>
              <p>
                Diese Aktion löscht die Sitzung einschließlich ihrer nativen
                Kompressionskette und aller delegierten Unteraufgaben aus
                Hermes. Eigenständige Branch- und Resetgespräche bleiben
                erhalten. Welche Kettenzeilen darüber hinaus betroffen sind,
                bleibt für den Client offen: bereinigt werden ausdrücklich nur
                konkret bestätigte IDs, keine abgeleitete Vollständigkeit.
              </p>
              {prepareNote ? (
                <p className="hermesv2-resource-status" role="status">
                  {prepareNote}
                </p>
              ) : null}
              {errorLine ? (
                <div className="hermesv2-resource-error" role="alert">
                  <p>{errorLine}</p>
                  {outcomeLine ? (
                    <p className="hermesv2-action-outcome">{outcomeLine}</p>
                  ) : null}
                  {bound && bound.status === "unknown" ? (
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => void resources.reconcileAction(bound.key)}
                    >
                      Bewusst neu lesen
                    </button>
                  ) : null}
                </div>
              ) : null}
                <div className="hermesv2-form-actions">
                  <button type="button" className="quiet-button" onClick={onClose}>
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="quiet-button modal-danger"
                    disabled={pending || token === null || unknownLocked}
                    aria-busy={pending || undefined}
                    title={unknownLocked ? "Erst bewusst neu lesen, dann bewusst wieder versuchen." : undefined}
                    onClick={confirmDelete}
                  >
                    {pending ? "Löscht…" : "Sitzung löschen"}
                  </button>
                </div>
              </>) : null}
            </>
          )}
        </div>
      )}
    </ModalFrame>
  );
}
