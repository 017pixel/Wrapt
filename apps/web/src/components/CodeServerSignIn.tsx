import { ModalFrame } from "./ModalDialog";

/** Nutzt die eingebaute GitHub-Anmeldung von code-server; Wrapt erhält keine Tokens. */
export function CodeServerSignIn({ editorUrl, open, onClose }: { editorUrl: string; open: boolean; onClose: () => void }) {
  return <ModalFrame open={open} title="GitHub, Copilot und Settings Sync" onClose={onClose}>
      {(requestClose) => <div className="space-y-4 p-4 text-sm text-text">
        <p className="text-muted">Im offiziellen Editor unter Konten bei GitHub anmelden. Danach Copilot aktivieren bzw. unter Verwalten die Einstellungssynchronisierung einschalten. Die Anmeldung öffnet ein separates Browserfenster, der Editor bleibt geöffnet.</p>
        <details>
          <summary className="cursor-pointer py-3">Unterschied zu code-server</summary>
          <p className="text-muted">Copilot und natives Settings Sync sind im offiziellen VS-Code-Editor verfügbar. code-server verwendet Open VSX und bietet keinen nativen Microsoft-Sync-Dienst. Copilot Chat fehlt im verwendeten Open-VSX-Katalog.</p>
        </details>
        <p className="text-muted">Bei einer Anmeldung per Gerätecode kann ein blockiertes Fenster durch <a href="https://github.com/login/device" target="_blank" rel="noopener noreferrer" className="text-accent underline">github.com/login/device</a> ersetzt werden. Nur den Code der gerade gestarteten Anmeldung eingeben und den Editor geöffnet lassen.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <a href={editorUrl} target="_blank" rel="noopener noreferrer" className="quiet-button min-h-11">Editor in neuem Tab</a>
          <button type="button" className="quiet-button-primary min-h-11" onClick={requestClose}>Zum Editor</button>
        </div>
      </div>}
    </ModalFrame>;
}
