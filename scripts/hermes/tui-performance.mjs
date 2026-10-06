import { createHash } from "node:crypto";

// Nur der geprüfte Transcript-Baustein wird angepasst. Neue Hermes-Versionen
// erhalten bei abweichendem Code ihren unveränderten offiziellen Renderer.
const supportedTranscriptHash = "bf0c6c0c154fe3a3e0549d6391e6838b240d32a37181608af3c059e1bfcfaa1f";
const startMarker = "const TranscriptPane = memo(";
const endMarker = "\n\nconst ComposerPane";

export function optimizeTuiLayout(source) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) return { source, applied: false };
  const transcript = source.slice(start, end);
  const hash = createHash("sha256").update(transcript).digest("hex");
  if (hash !== supportedTranscriptHash) return { source, applied: false };

  const comparator = `}, (previous, next) =>
  previous.composer.cols === next.composer.cols &&
  previous.nativeMode === next.nativeMode &&
  previous.progress.showProgressArea === next.progress.showProgressArea &&
  previous.actions.clearSelection === next.actions.clearSelection &&
  previous.actions.setStickyPrompt === next.actions.setStickyPrompt &&
  previous.transcript.historyItems === next.transcript.historyItems &&
  previous.transcript.virtualRows === next.transcript.virtualRows &&
  previous.transcript.scrollRef === next.transcript.scrollRef &&
  previous.transcript.virtualHistory.start === next.transcript.virtualHistory.start &&
  previous.transcript.virtualHistory.end === next.transcript.virtualHistory.end &&
  previous.transcript.virtualHistory.topSpacer === next.transcript.virtualHistory.topSpacer &&
  previous.transcript.virtualHistory.bottomSpacer === next.transcript.virtualHistory.bottomSpacer &&
  previous.transcript.virtualHistory.offsets === next.transcript.virtualHistory.offsets &&
  previous.transcript.virtualHistory.measureRef === next.transcript.virtualHistory.measureRef
)`;
  const optimized = transcript.slice(0, -2) + comparator;
  return { source: source.slice(0, start) + optimized + source.slice(end), applied: true };
}
