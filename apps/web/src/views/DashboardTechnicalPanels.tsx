import { useState } from "react";
import type { OperationalMetricsResponse, ReadinessResponse, CommandsResponse } from "@wrapt/contracts";
import { CheckIcon, CopyIcon, ShieldIcon, WarningIcon, CommandIcon, ChevronDownIcon } from "../components/icons";
import { Badge, StateDot } from "../components/primitives";
import { Meter, loadTone } from "../components/charts";
import { formatBytes } from "../lib/format";
import { writeClipboardText } from "../lib/clipboard";
import { runWithViewTransition } from "../lib/viewTransition";
import { Panel, PanelError, PanelSkeleton, Facts, queryMessage, type DashboardQuery as Query } from "./DashboardPanels";
import { integer, decimal, percentOf, formatDateTime } from "./dashboardMetrics";

const readinessCheckLabels: Record<string, string> = {
  database: "Datenbank",
  "data-directory": "Datenverzeichnis",
};

function ReadinessList({ readiness }: { readiness: Query<ReadinessResponse> }) {
  if (readiness.isPending) return <PanelSkeleton label="Bereitschaft wird geprüft" rows={2} />;
  if (readiness.isError) {
    return <PanelError message={queryMessage(readiness.error, "Die Bereitschaftsprüfung antwortet nicht. Das Backend meldet sich als eingeschränkt.")} />;
  }
  return (
    <ul className="dash-check-list">
      {readiness.data.checks.map((check) => (
        <li key={check.name}>
          <StateDot state={check.status === "ok" ? "active" : "error"} />
          <span className="dash-check-name">{readinessCheckLabels[check.name] ?? check.name}</span>
          <strong className={check.status === "ok" ? "is-ok" : "is-bad"}>{check.status === "ok" ? "in Ordnung" : "fehlgeschlagen"}</strong>
        </li>
      ))}
      {readiness.data.checks.length === 0 ? <li className="dash-muted">Keine Prüfungen konfiguriert.</li> : null}
    </ul>
  );
}

function WorkbenchDiagnosticsPanel({
  diagnostics,
  readiness,
}: {
  diagnostics: Query<OperationalMetricsResponse>;
  readiness: Query<ReadinessResponse>;
}) {
  const data = diagnostics.data;
  const routes = data?.http.routes.slice(0, 6) ?? [];
  const slowestRoute = Math.max(1, ...routes.map((route) => route.p99Milliseconds));

  return (
    <Panel
      title="Betriebsdiagnose"
      subtitle="Technische Messwerte und Systemhinweise"
      icon={<ShieldIcon className="h-4 w-4" />}
      name="workbench"
      className="is-span-12"
      meta={
        data ? (
          <Badge tone={data.degradedReasons.length ? "warn" : "ok"}>
            {data.degradedReasons.length ? `${data.degradedReasons.length} Hinweise` : "Betrieb unauffällig"}
          </Badge>
        ) : null
      }
    >
      {diagnostics.isError ? (
        <PanelError message={queryMessage(diagnostics.error, "Diagnosedaten konnten nicht geladen werden.")} />
      ) : diagnostics.isPending ? (
        <PanelSkeleton label="Diagnose lädt" rows={4} />
      ) : (
        <div className="dash-diagnostics-body">
          <div>
            <p className="dash-subheading">Bereitschaft</p>
            <ReadinessList readiness={readiness} />

            <p className="dash-subheading">Betriebshinweise</p>
            {data!.degradedReasons.length ? (
              <ul className="dash-reason-list">
                {data!.degradedReasons.map((reason) => (
                  <li key={reason}>
                    <WarningIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">Der Dienst meldet keine Einschränkungen.</p>
            )}

            <p className="dash-subheading">Hintergrund</p>
            <Facts
              min="100%"
              items={[
                { label: "Audit", value: data!.audit.valid ? `gültig · ${integer.format(data!.audit.entries)} Einträge` : "Prüfung erforderlich" },
                { label: "Letzter Audit-Eintrag", value: data!.audit.latestAt ? formatDateTime(data!.audit.latestAt) : "keiner" },
                { label: "Offene Orbit-Backups", value: integer.format(data!.orbit.pendingBackups) },
                { label: "Orbit-Fehler", value: data!.orbit.lastError ?? "keiner" },
              ]}
            />
          </div>

          <div>
            <p className="dash-subheading">Prozess und Anfragen</p>
            <Facts
              items={[
                { label: "Anfragen gesamt", value: integer.format(data!.http.totalRequests) },
                { label: "Gerade aktiv", value: integer.format(data!.http.activeRequests) },
                { label: "Clientfehler (4xx)", value: integer.format(data!.http.clientErrors) },
                { label: "Serverfehler (5xx)", value: integer.format(data!.http.serverErrors) },
                { label: "Event-Loop Ø", value: `${decimal.format(data!.eventLoop.meanMilliseconds)} ms` },
                { label: "Event-Loop max", value: `${decimal.format(data!.eventLoop.maxMilliseconds)} ms` },
                { label: "RSS", value: formatBytes(data!.processMemory.rssBytes) },
                { label: "Extern", value: formatBytes(data!.processMemory.externalBytes) },
              ]}
            />
            <div className="dash-gauge">
              <div>
                <span>Heap</span>
                <strong className="font-mono">
                  {formatBytes(data!.processMemory.heapUsedBytes)} / {formatBytes(data!.processMemory.heapTotalBytes)}
                </strong>
              </div>
              <Meter
                value={percentOf(data!.processMemory.heapUsedBytes, data!.processMemory.heapTotalBytes)}
                tone={loadTone(percentOf(data!.processMemory.heapUsedBytes, data!.processMemory.heapTotalBytes), 90, 97)}
                label="Heap-Auslastung"
              />
            </div>
            <div className="dash-gauge">
              <div>
                <span>Preview-Slots</span>
                <strong className="font-mono">{data!.preview.freeSlots} von {data!.preview.totalSlots} frei</strong>
              </div>
              <Meter
                value={percentOf(data!.preview.totalSlots - data!.preview.freeSlots, data!.preview.totalSlots)}
                tone={data!.preview.quarantinedSlots > 0 ? "warn" : "accent"}
                label="Belegte Preview-Slots"
              />
              <small>{data!.preview.resettingSlots} werden zurückgesetzt · {data!.preview.quarantinedSlots} in Quarantäne</small>
            </div>
          </div>

          <div>
            <p className="dash-subheading">Langsamste Routen</p>
            {routes.length ? (
              <ul className="dash-route-list">
                {routes.map((route) => (
                  <li key={`${route.method}-${route.route}`}>
                    <div className="dash-route-head">
                      <span className="font-mono">
                        <b>{route.method}</b> {route.route}
                      </span>
                      <strong className="font-mono">{decimal.format(route.p99Milliseconds)} ms</strong>
                    </div>
                    <Meter
                      value={(route.p99Milliseconds / slowestRoute) * 100}
                      tone={route.errorCount > 0 ? "bad" : loadTone(route.p99Milliseconds, 250, 800)}
                      label={`P99 von ${route.method} ${route.route}`}
                    />
                    <small className="font-mono">
                      {integer.format(route.count)} Aufrufe · P95 {decimal.format(route.p95Milliseconds)} ms · {integer.format(route.errorCount)} Fehler
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">Seit dem Start wurden noch keine Routen gemessen.</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    try {
      await writeClipboardText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1_500);
    } catch {
      setCopyState("error");
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={copyState === "error" ? "Kopieren wurde vom Browser nicht erlaubt" : "Kopieren"}
      className="quiet-button shrink-0 text-[12px] max-md:text-[13px]"
    >
      {copyState === "copied" ? <CheckIcon className="h-3.5 w-3.5 text-ok" /> : <CopyIcon className={`h-3.5 w-3.5 ${copyState === "error" ? "text-bad" : ""}`} />}
      <span aria-live="polite">{copyState === "copied" ? "Kopiert" : copyState === "error" ? "Fehlgeschlagen" : "Kopieren"}</span>
    </button>
  );
}

function CommandsPanel({
  commands,
  onSelect,
}: {
  commands: Query<CommandsResponse>;
  onSelect: (command: { name: string; description: string; command: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = commands.data?.commands ?? [];
  const visible = expanded ? all : all.slice(0, 4);

  return (
    <Panel
      title="Befehle"
      subtitle="Nachschlagen und kopieren, keine Ausführung"
      icon={<CommandIcon className="h-4 w-4" />}
      name="commands"
      className="is-span-8"
    >
      {commands.isError ? (
        <PanelError message={queryMessage(commands.error, "Befehle konnten nicht geladen werden.")} />
      ) : commands.isPending ? (
        <PanelSkeleton label="Befehle laden" rows={2} />
      ) : (
        <>
          <ul className="dash-command-list">
            {visible.map((command) => (
              <li key={command.id}>
                <div>
                  <strong>{command.name}</strong>
                  <small>{command.description}</small>
                </div>
                <code className="font-mono">{command.command}</code>
                <button type="button" className="quiet-button dash-command-view" onClick={() => onSelect(command)}>
                  Anzeigen
                </button>
                <CopyButton value={command.command} />
              </li>
            ))}
          </ul>
          {all.length > 4 ? (
            <button type="button" className="dash-more" onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}>
              {expanded ? "Weniger anzeigen" : `${all.length - 4} weitere Befehle anzeigen`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

export function AdvancedDashboardPanel({
  diagnosticsVisible,
  commandsVisible,
  diagnostics,
  readiness,
  commands,
  onSelect,
}: {
  diagnosticsVisible: boolean;
  commandsVisible: boolean;
  diagnostics: Query<OperationalMetricsResponse>;
  readiness: Query<ReadinessResponse>;
  commands: Query<CommandsResponse>;
  onSelect: (command: { name: string; description: string; command: string }) => void;
}) {
  if (!diagnosticsVisible && !commandsVisible) return null;
  const description = diagnosticsVisible && commandsVisible ? "Diagnose · Befehle" : diagnosticsVisible ? "Diagnose" : "Befehle";
  const issueCount = diagnosticsVisible ? diagnostics.data?.degradedReasons.length ?? 0 : 0;

  return (
    <details className="dash-panel dash-advanced-panel is-span-12">
      <summary className="dash-advanced-summary">
        <span className="dash-panel-icon"><ShieldIcon className="h-4 w-4" /></span>
        <span className="dash-advanced-copy">
          <strong>Technische Details</strong>
          <small>{issueCount ? `${issueCount} Betriebshinweise` : description}</small>
        </span>
        <ChevronDownIcon className="dash-advanced-chevron h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="dash-advanced-body">
        {diagnosticsVisible ? <WorkbenchDiagnosticsPanel diagnostics={diagnostics} readiness={readiness} /> : null}
        {commandsVisible ? <CommandsPanel commands={commands} onSelect={onSelect} /> : null}
      </div>
    </details>
  );
}

