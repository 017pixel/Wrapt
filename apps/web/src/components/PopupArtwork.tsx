/** Kleine Popup-Motive zeichnen sofort, ohne zweiten Fade nach dem Öffnen. */
export function PopupArtwork({ className, src }: { className: string; src: string }) {
  return (
    <img
      className={className}
      src={src}
      alt=""
      aria-hidden="true"
      decoding="sync"
      loading="eager"
      onError={(event) => { event.currentTarget.hidden = true; }}
    />
  );
}
