import { ExternalLinkIcon } from "../icons";

/**
 * Externe Adressen laufen nie über den lokalen Preview-Gateway. Sie werden
 * immer im echten Client-Browser geöffnet.
 */
export function ExternalPreviewChoice({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // Unparsbare Eingaben werden unverändert angezeigt.
  }
  return (
    <div className="preview-external-choice">
      <strong>Externe Adresse</strong>
      <code>{host}</code>
      <p>
        Externe Websites laufen nicht über die lokalen Preview-Slots. Sie können Embedding blockieren, eigene Cookies
        benötigen und gehören deshalb in einen echten Browser.
      </p>
      <div>
        <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon className="h-3.5 w-3.5" />Im Browser öffnen</a>
      </div>
    </div>
  );
}
