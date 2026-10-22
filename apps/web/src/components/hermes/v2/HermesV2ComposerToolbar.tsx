// Menüleiste des Composers: Modell, Denktiefe und Freigabe als Chips.
// Sperrgründe stehen als Titel am betroffenen Chip, nicht als eigene Zeile.
import { ChevronDownIcon } from "../../icons";
import {
  HermesV2ApprovalChip,
  type ComposerApprovalMode,
} from "./HermesV2ComposerChips";
import { HermesV2ReasoningControl } from "./HermesV2ReasoningControl";
import { canDisableReasoningFor } from "./model-picker-data";
import type { ChatComposerView } from "./chat-composer-types";
import type { HermesV2Effort } from "@wrapt/contracts/hermes-v2";
import type { ChatCatalogView, ChatSessionView } from "./chat-types";

export interface HermesV2ComposerToolbarProps {
  composer: ChatComposerView;
  catalog: ChatCatalogView;
  snapshot: ChatSessionView | null;
  onModelPicker: (open: boolean) => void;
  onSelectReasoning: (effort: HermesV2Effort) => void | Promise<void>;
  onApprovalMode: (mode: ComposerApprovalMode) => void | Promise<void>;
}

export function HermesV2ComposerToolbar(props: HermesV2ComposerToolbarProps) {
  const {
    composer,
    catalog,
    snapshot,
    onModelPicker,
    onSelectReasoning,
    onApprovalMode,
  } = props;
  // Beobachtete Auswahl der Sitzung, nicht Katalogcache oder Wunsch.
  const current = snapshot?.selection ?? null;
  const efforts = catalog.hermesEfforts ?? [];
  const canDisable = canDisableReasoningFor(catalog.models, current);
  const reasoningLockedReason = !snapshot?.writable
    ? "Diese Sitzung nimmt derzeit keine Einstellungsänderung an."
    : snapshot.running === true
      ? "Während des laufenden Turns bleibt die Denktiefe unverändert."
      : composer.reasoning.status === "pending"
        ? "Eine Auswahl ist bereits in Klärung."
        : !composer.settings
          ? "Die Composerprojektion ist in dieser Fläche nicht verfügbar."
          : null;
  // Auch der Modelleinstieg sperrt: ladende oder nur lesbare Sitzungen
  // nehmen gerade keine Auswahl an, und der Grund ist am Chip erreichbar.
  const modelLockedReason = !snapshot
    ? "Keine Sitzung gewählt."
    : !snapshot.writable
      ? "Diese Sitzung nimmt derzeit keine Einstellungsänderung an."
      : snapshot.loading
        ? "Die Sitzung ist noch im Laden; eine Auswahl beginnt danach."
        : null;
  const approvals = composer.settings?.approvals ?? null;
  return (
    <div className="hermesv2-composer-chips">
      <button
        type="button"
        className="quiet-button hermesv2-chip hermesv2-model-chip"
        aria-label="Modell wählen"
        aria-haspopup="dialog"
        disabled={modelLockedReason !== null}
        title={
          modelLockedReason ??
          (current ? `Modell wählen: ${current.model}` : "Modell wählen")
        }
        onClick={() => onModelPicker(true)}
      >
        <span className="hermesv2-composer-model">{current?.model ?? "Modell wählen"}</span>
        <ChevronDownIcon aria-hidden style={{ color: "currentColor" }} />
      </button>
      <HermesV2ReasoningControl
        selected={composer.reasoning.requested}
        status={composer.reasoning.status}
        observedEffort={composer.reasoning.observed?.effort ?? null}
        observedWire={composer.reasoning.observed?.wire ?? null}
        ladder={efforts}
        canDisableReasoning={canDisable}
        locked={Boolean(reasoningLockedReason)}
        lockedReason={reasoningLockedReason}
        onSelect={(effort) => Promise.resolve(onSelectReasoning(effort))}
      />
      <HermesV2ApprovalChip
        mode={approvals?.mode ?? null}
        effectiveBypass={approvals?.effectiveBypass === true}
        options={approvals?.options ?? []}
        editable={approvals?.editable === true}
        onSelect={onApprovalMode}
      />
    </div>
  );
}
