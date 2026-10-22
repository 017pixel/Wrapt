import { useEffect, useMemo, useState } from "react";
import { ModalFrame } from "../../ModalDialog";
import type { HermesV2Sidebar, SnoozeInput } from "./sidebar-types";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "lokal";
const exactFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type Preset = "30m" | "1h" | "evening" | "tomorrow" | "custom";
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "30m", label: "30 Minuten" },
  { id: "1h", label: "1 Stunde" },
  { id: "evening", label: "Heute Abend" },
  { id: "tomorrow", label: "Morgen 09:00" },
  { id: "custom", label: "Eigene Zeit" },
];

/**
 * Zurückstellen als Bottom Sheet: Presets und eigene Zeit, exaktes Datum,
 * Uhrzeit und Zeitzone. Zeitrechnung und DST-Prüfung kommen aus dem Hook
 * (previewSnooze); hier entsteht kein zweites Date-Parsing.
 */
export function HermesV2SnoozeSheet({
  sidebar,
  sessionId,
  expectedRevision,
  open,
  onClose,
}: {
  sidebar: HermesV2Sidebar;
  sessionId: string;
  expectedRevision: number;
  open: boolean;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<Preset>("30m");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [offsetMinutes, setOffsetMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreset("30m");
    setDate("");
    setTime("");
    setOffsetMinutes(null);
    setBusy(false);
  }, [open]);

  // Explizite Offset-Auswahl nur für Mehrdeutigkeit (DST); jede manuelle
  // Änderung an Datum, Uhrzeit oder Preset hebt sie wieder auf.
  const choosePreset = (next: Preset) => {
    setPreset(next);
    setOffsetMinutes(null);
  };
  const chooseDateTime = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    setOffsetMinutes(null);
  };

  const input: SnoozeInput | null = useMemo<SnoozeInput | null>(() => {
    if (preset !== "custom") return { timeZone, preset };
    if (!date || !time) return null;
    if (offsetMinutes === null)
      return { timeZone, preset: "custom", date, time };
    return { timeZone, preset: "custom", date, time, offsetMinutes };
  }, [preset, date, time, offsetMinutes]);

  const resolution = input ? sidebar.previewSnooze(input) : null;
  const exact = resolution?.ok
    ? exactFormatter.format(new Date(resolution.until))
    : null;

  const commit = () => {
    if (!input || busy) return;
    setBusy(true);
    // Fehler (etwa offener Request) erscheinen ehrlich im Sidebar-Viewmodel;
    // kein stiller Doppelversuch, kein automatisches Wiederholen.
    void sidebar.snooze(sessionId, expectedRevision, input).finally(() => {
      setBusy(false);
      onClose();
    });
  };

  return (
    <ModalFrame open={open} title="Sitzung zurückstellen" onClose={onClose}>
      {() => (
        <div className="hermesv2-snooze">
          <fieldset className="hermesv2-snooze-presets">
            <legend className="sr-only">Zeitpunkt wählen</legend>
            {PRESETS.map((entry) => (
              <label key={entry.id} className="hermesv2-snooze-preset">
                <input
                  type="radio"
                  name="hermesv2-snooze-preset"
                  value={entry.id}
                  checked={preset === entry.id}
                  onChange={() => choosePreset(entry.id)}
                />
                <span>{entry.label}</span>
              </label>
            ))}
          </fieldset>
          {preset === "custom" ? (
            <div className="hermesv2-snooze-custom">
              <label className="hermesv2-field">
                <span>Datum</span>
                <input
                  type="date"
                  className="hermesv2-input"
                  value={date}
                  onChange={(event) => chooseDateTime(event.target.value, time)}
                />
              </label>
              <label className="hermesv2-field">
                <span>Uhrzeit</span>
                <input
                  type="time"
                  className="hermesv2-input"
                  value={time}
                  onChange={(event) => chooseDateTime(date, event.target.value)}
                />
              </label>
            </div>
          ) : null}
          {resolution?.ok ? (
            <p className="hermesv2-snooze-when" role="status">
              Zurückstellung bis {exact} ({timeZone})
            </p>
          ) : null}
          {resolution && !resolution.ok ? (
            <div className="hermesv2-snooze-invalid" role="alert">
              <p>{resolution.message}</p>
              {resolution.alternatives.length > 0 ? (
                <ul>
                  {resolution.alternatives.map((alternative, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() => {
                          const shifted = new Date(alternative.until);
                          chooseDateTime(
                            toLocalDate(shifted),
                            toLocalTime(shifted),
                          );
                          setOffsetMinutes(alternative.offsetMinutes);
                        }}
                      >
                        {exactFormatter.format(new Date(alternative.until))} (
                        {formatUtcOffset(alternative.offsetMinutes)}) wählen
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="hermesv2-form-actions">
            <button type="button" className="quiet-button" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="button"
              className="quiet-button-primary"
              disabled={!resolution?.ok || busy}
              onClick={commit}
            >
              {busy ? "Stellt zurück…" : "Zurückstellen"}
            </button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}

function toLocalDate(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toLocalTime(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Unterscheidet beide DST-Varianten im Label über den UTC-Versatz. */
function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
