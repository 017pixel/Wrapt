import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { calloutVariants, type CalloutVariant } from "./CalloutNode.js";

export const calloutVariantLabels: Record<CalloutVariant, string> = {
  info: "Hinweis",
  ok: "Tipp",
  warn: "Warnung",
  bad: "Achtung",
  neutral: "Wichtig",
};

/** Notion-Callout mit editierbarem Titel und Farbwahl. */
export function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const variant = (node.attrs.variant ?? "info") as CalloutVariant;
  const title = (node.attrs.title ?? "") as string;
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper className="note-callout" data-variant={variant}>
      <div className="note-callout-head" contentEditable={false}>
        <input
          className="note-callout-title"
          value={title}
          placeholder={calloutVariantLabels[variant]}
          aria-label="Callout-Titel"
          disabled={!editable}
          onChange={(event) => updateAttributes({ title: event.target.value === "" ? null : event.target.value })}
        />
        {editable ? (
          <div className="note-callout-variants" role="radiogroup" aria-label="Callout-Farbe">
            {calloutVariants.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === variant}
                aria-label={calloutVariantLabels[option]}
                title={calloutVariantLabels[option]}
                data-variant={option}
                className={option === variant ? "is-active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => updateAttributes({ variant: option })}
              />
            ))}
          </div>
        ) : null}
      </div>
      <NodeViewContent className="note-callout-content" />
    </NodeViewWrapper>
  );
}
