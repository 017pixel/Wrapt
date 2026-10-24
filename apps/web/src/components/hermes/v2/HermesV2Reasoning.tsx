/** Einklappbares Reasoning. Der Block entsteht nur bei explizit geliefertem Inhalt. */
export function HermesV2Reasoning({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  return (
    <details
      className="hermesv2-reasoning"
      data-streaming={streaming ? "true" : "false"}
    >
      <summary>{streaming ? "Denkt nach…" : "Gedanken"}</summary>
      <div className="hermesv2-reasoning-body" role="region" aria-label="Gedanken">
        <p>{text}</p>
      </div>
    </details>
  );
}
