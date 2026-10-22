import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HermesV2Memory } from "@wrapt/contracts/hermes-v2";
import type { HermesV2Resources, ResourceRead } from "./resource-types";
import { HermesV2PendingList } from "./HermesV2PendingList";
import { TextBlock } from "./resource-text";
import {
  HermesV2SettingsGroup,
  HermesV2SettingsPage,
  HermesV2SettingsRow,
  HermesV2SettingsSection,
} from "./hermes-v2-settings";
import "./hermes-v2-resources.css";
import "./hermes-v2-memory.css";

/** Ab dieser Länge wird die Dateivorschau gekürzt und aufklappbar. */
const PREVIEW_LIMIT = 1200;

type MemoryFile = HermesV2Memory["files"][number];
type MemoryProvider = HermesV2Memory["providers"][number];

/**
 * Memory-Bereich als Verwaltungsseite: links die nativen Dateien breit und
 * lesbar, rechts die Anbieter kompakt. Fehlend, leer, gekürzt und unlesbar
 * bleiben unterscheidbar; der JSON-Beleg der ausstehenden Schreibvorgänge
 * bleibt gekürzt und aufklappbar. Externe Anbieter sind kein Builtin-Export.
 */
export function HermesV2MemoryArea({ resources }: { resources: HermesV2Resources }) {
  const memory = resources.memory;
  const data = memory.data;
  const files = data?.files ?? [];
  const providers = data?.providers ?? [];
  const records = resources.pending.data?.records ?? [];
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({});
  const [payloadOpen, setPayloadOpen] = useState(false);

  const toggleFile = (name: string) =>
    setOpenFiles((current) => ({ ...current, [name]: !current[name] }));

  return (
    <HermesV2SettingsPage
      title="Memory"
      area="memory"
      description={headNote(data)}
      actions={
        <button
          type="button"
          className="quiet-button"
          disabled={memory.status === "loading" || !resources.available}
          onClick={() => void resources.refresh()}
        >
          Memory aktualisieren
        </button>
      }
    >
      {memoryRows(memory, resources)}
      <section className="hermesv2-memory-columns" aria-label="Memory-Belege">
        <section className="hermesv2-memory-column" aria-label="Dateien">
          <h2 className="hermesv2-memory-column-title">Dateien</h2>
          {files.length === 0 ? (
            <p className="hermesv2-resource-status">Keine builtin-Dateien angegeben.</p>
          ) : null}
          <ul className="hermesv2-memory-list">
            {files.map((file) => (
              <li key={file.name} className="hermesv2-memory-file" data-hermes-memory-file={file.name}>
                <div className="hermesv2-memory-file-head">
                  <h3 className="hermesv2-memory-file-name" aria-label={`Memory-Datei: ${file.name}`}>
                    {file.name}
                  </h3>
                  {file.bytes !== null ? (
                    <span className="hermesv2-memory-file-meta">
                      Belegt {file.bytes.toLocaleString("de-DE")} Bytes
                    </span>
                  ) : null}
                </div>
                <MemoryFileText
                  file={file}
                  expanded={openFiles[file.name] === true}
                  onToggle={() => toggleFile(file.name)}
                />
              </li>
            ))}
          </ul>
        </section>
        <section className="hermesv2-memory-column" aria-label="Anbieter">
          <h2 className="hermesv2-memory-column-title">Anbieter</h2>
          {providers.length === 0 ? (
            <p className="hermesv2-resource-status">Keine Anbieter angegeben.</p>
          ) : null}
          <ul className="hermesv2-memory-list">
            {providers.map((provider) => (
              <li key={provider.name} className="hermesv2-memory-provider">
                <div className="hermesv2-memory-provider-head">
                  <span className="hermesv2-memory-provider-name">{provider.name}</span>
                  <span className="hermesv2-memory-provider-state">{providerState(provider)}</span>
                </div>
                {provider.description ? (
                  <p className="hermesv2-memory-provider-description">{provider.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </section>
      <HermesV2SettingsSection
        title="Schreibvorschläge"
        actions={
          records.length > 0 ? (
            <button
              type="button"
              className="quiet-button"
              aria-expanded={payloadOpen}
              onClick={() => setPayloadOpen((current) => !current)}
            >
              {payloadOpen ? "JSON-Beleg einkürzen" : "JSON-Beleg aufklappen"}
            </button>
          ) : null
        }
      >
        <div
          className="hermesv2-memory-pending"
          data-expanded={payloadOpen ? "true" : "false"}
          data-hermes-memory-pending="pending"
        >
          <HermesV2PendingList resources={resources} />
        </div>
      </HermesV2SettingsSection>
    </HermesV2SettingsPage>
  );
}

/**
 * Dateivorschau: fester Umbruch, begrenzte Höhe und ein "Mehr anzeigen",
 * sobald der Beleg die Vorschauhöhe überschreitet. Die Messung läuft im
 * Browser am echten Textblock; die Zeichenzahl greift nur, wenn keine
 * Messung möglich ist (zum Beispiel im Test ohne Layout).
 */
function MemoryFileText({
  file,
  expanded,
  onToggle,
}: {
  file: MemoryFile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<boolean | null>(null);
  useEffect(() => {
    const box = holder.current?.querySelector<HTMLElement>(".hermesv2-resource-scroll");
    if (!box) return;
    const measure = () => {
      if (expanded || box.clientHeight === 0) return;
      setMeasured(box.scrollHeight > box.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [file.text, expanded]);
  // Ohne messbare Vorschau (kein Layout) entscheidet die Zeichenzahl.
  const long = measured ?? (file.text?.length ?? 0) > PREVIEW_LIMIT;
  return (
    <div
      ref={holder}
      className="hermesv2-memory-file-text"
      data-expanded={expanded ? "true" : "false"}
    >
      <TextBlock text={file} ariaLabel={`Memory-Datei: ${file.name}`} />
      {long ? (
        <button
          type="button"
          className="quiet-button hermesv2-memory-more"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
        </button>
      ) : null}
    </div>
  );
}

/** Kopfzeile der Fläche: belegter Anbieter und der Umfang des Belegs. */
function headNote(data: HermesV2Memory | null): string {
  if (!data) return "Native Memorydateien und die belegten Anbieter des Agenten.";
  return [
    data.active ? `Aktiver Anbieter: ${data.active}` : "Kein aktiver Anbieter angegeben.",
    data.builtinOnly ? "Nur builtin-Dateien: externe Anbieter exportieren nicht mit." : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Zustand eines Anbieters, wie der native Beleg ihn hergibt. */
function providerState(provider: MemoryProvider): string {
  return (
    [
      provider.available === null
        ? "Verfügbarkeit unbekannt"
        : provider.available
          ? "verfügbar"
          : "nicht verfügbar",
      provider.configured === null
        ? null
        : provider.configured
          ? "konfiguriert"
          : "nicht konfiguriert",
      provider.status ?? null,
    ]
      .filter(Boolean)
      .join(" · ") || "Zustand nativ unbekannt"
  );
}

/** Zustandszeilen der Fläche; nichts wird stillschweigend leer gelassen. */
function memoryRows(
  memory: ResourceRead<HermesV2Memory>,
  resources: HermesV2Resources,
): ReactNode {
  const rows: ReactNode[] = [];
  if (memory.status === "idle") {
    rows.push(
      <HermesV2SettingsRow key="idle" title={<span role="status">Memory noch nicht geladen.</span>} />,
    );
  }
  if (memory.status === "loading") {
    rows.push(
      <HermesV2SettingsRow key="loading" title={<span role="status">Memory wird geladen…</span>} />,
    );
  }
  if (memory.status === "missing") {
    rows.push(<HermesV2SettingsRow key="missing" title="Natives Memory ist nicht erreichbar." />);
  }
  if (memory.status === "error" && memory.error) {
    rows.push(
      <HermesV2SettingsRow
        key="error"
        title="Memory nicht lesbar"
        status={memory.error.message}
        control={
          <button
            type="button"
            className="quiet-button"
            onClick={() => void resources.refresh()}
          >
            Memory aktualisieren
          </button>
        }
      />,
    );
  }
  if (memory.data?.truncated) {
    rows.push(<HermesV2SettingsRow key="truncated" title="Memorybelege sind gekürzt." />);
  }
  if (rows.length === 0) return null;
  return <HermesV2SettingsGroup>{rows}</HermesV2SettingsGroup>;
}
