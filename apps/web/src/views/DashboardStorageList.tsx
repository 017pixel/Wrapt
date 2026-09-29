import { useState } from "react";
import type { ServerMetrics } from "@wrapt/contracts";
import { Meter, loadTone } from "../components/charts";
import { formatBytes } from "../lib/format";
import { PanelSkeleton } from "./DashboardPanels";

const VISIBLE_DISKS = 3;

type Disk = ServerMetrics["disks"][number];

function diskPriority(mount: string): number {
  if (mount === "/") return 0;
  if (mount === "/System/Volumes/Data") return 1;
  if (mount.startsWith("/Volumes/")) return 2;
  if (mount.startsWith("/System/Volumes/")) return 4;
  return 3;
}

function diskLabel(mount: string): string {
  if (mount === "/") return "System";
  if (mount === "/System/Volumes/Data") return "Daten";

  const parts = mount.split("/").filter(Boolean);
  const name = parts.at(-1);
  if (!name) return "System";
  if (mount.startsWith("/Volumes/")) {
    const volumeName = parts[1] ?? name;
    return /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(volumeName)
      ? "Externes Volume"
      : `Extern · ${volumeName}`;
  }
  return name;
}

export function DashboardStorageList({ disks, isPending }: { disks: Disk[]; isPending: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [...disks].sort((left, right) =>
    diskPriority(left.mount) - diskPriority(right.mount) || right.usedPercent - left.usedPercent,
  );
  const visible = expanded ? ordered : ordered.slice(0, VISIBLE_DISKS);

  return (
    <section className="dash-storage">
      <div className="dash-storage-heading">
        <p className="dash-subheading">Datenträger</p>
        {!isPending && ordered.length ? <span>{ordered.length}</span> : null}
      </div>
      {isPending ? (
        <PanelSkeleton label="Laufwerke laden" rows={2} />
      ) : ordered.length ? (
        <>
          <ul className="dash-disk-list">
            {visible.map((disk) => (
              <li key={disk.mount}>
                <div className="dash-disk-summary">
                  <span title={disk.mount}>{diskLabel(disk.mount)}</span>
                  <strong className="font-mono">{disk.usedPercent.toFixed(0)} %</strong>
                </div>
                <Meter value={disk.usedPercent} tone={loadTone(disk.usedPercent, 75, 90)} label={`Belegung ${disk.mount}`} />
                {expanded ? <small className="dash-disk-path" title={disk.mount}>{disk.mount}</small> : null}
                <small>{formatBytes(disk.availableBytes)} frei</small>
              </li>
            ))}
          </ul>
          {ordered.length > VISIBLE_DISKS ? (
            <button
              type="button"
              className="dash-disk-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Weniger anzeigen" : `${ordered.length - VISIBLE_DISKS} weitere anzeigen`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="dash-muted">Keine Laufwerke erkannt.</p>
      )}
    </section>
  );
}
