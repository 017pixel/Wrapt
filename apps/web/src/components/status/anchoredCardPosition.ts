/**
 * Position einer an einen Trigger gehefteten Hover-Card.
 *
 * Die Karte hängt in einem Portal am `document.body` und wird aus dem
 * Anker-Rechteck berechnet und gegen den Viewport geklemmt. Zusätzlich liefert
 * die Rechnung den Abstand des Pfeils von der rechten Kartenkante, damit er auf
 * die Mitte des Triggers zeigt — auch wenn die Karte links geklemmt wird.
 */

export const CARD_WIDTH = 384;
export const CARD_MAX_HEIGHT = 460;

export interface CardLayout {
  readonly width?: number;
  readonly maxHeight?: number;
  readonly align?: "start" | "end";
}

const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 10;
const ARROW_INSET = 12;

export interface CardAnchor {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface AnchoredCardPosition {
  readonly left: number;
  readonly bottom: number;
  /** Höhe der Karte; nie größer als der Platz über oder unter dem Trigger. */
  readonly height: number;
  readonly width: number;
  /** Abstand des Pfeils von der rechten Kartenkante. */
  readonly arrowOffset: number;
  readonly placement: "above" | "below";
}

/**
 * Die Karte wird nie höher als der Raum, den der Trigger tatsächlich lässt.
 * Auf einem flachen Fenster wäre sie sonst über den oberen Bildschirmrand
 * hinaus gewachsen und Kopf wie erste Zeilen wären unerreichbar — der innere
 * Scrollbereich löst das nicht, weil er an einer Position startet, die es gar
 * nicht gibt. Darum wird zuerst der größere der beiden freien Bereiche gewählt
 * und die Höhe darauf begrenzt.
 */
export function positionAnchoredCard(
  anchor: CardAnchor,
  content: number,
  viewport: ViewportSize,
  layout: CardLayout = {},
): AnchoredCardPosition {
  const width = Math.min(layout.width ?? CARD_WIDTH, Math.max(0, viewport.width - VIEWPORT_MARGIN * 2));
  // Standardmäßig rechtsbündig über dem Trigger: der sitzt meist am rechten
  // Rand, die Karte wächst nach links. Fehlt rechts Platz, wird geklemmt.
  const preferredLeft = layout.align === "start" ? anchor.left : anchor.right - width;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(preferredLeft, viewport.width - width - VIEWPORT_MARGIN),
  );

  const spaceAbove = Math.max(0, anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN);
  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN);
  const placement = spaceAbove >= spaceBelow ? "above" : "below";
  const available = Math.max(0, placement === "above" ? spaceAbove : spaceBelow);
  const height = Math.min(layout.maxHeight ?? CARD_MAX_HEIGHT, content, available);

  const center = anchor.left + anchor.width / 2;
  const arrowOffset = Math.max(
    ARROW_INSET,
    Math.min(left + width - center, width - ARROW_INSET),
  );

  // Platz unter dem Trigger ist ebenfalls gedeckt: das Setzen von `bottom`
  // reicht dann nicht, die Höhe muss die Position mitbestimmen.
  if (placement === "below") {
    return {
      left,
      bottom: viewport.height - anchor.bottom - ANCHOR_GAP - height,
      height,
      width,
      arrowOffset,
      placement,
    };
  }
  return {
    left,
    bottom: Math.max(VIEWPORT_MARGIN, viewport.height - anchor.top + ANCHOR_GAP),
    height,
    width,
    arrowOffset,
    placement,
  };
}
