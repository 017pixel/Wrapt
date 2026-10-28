/** Eine flüchtige Kopie zeigt das Ziel, während die echte Aktion sofort startet. */
export function animateThreadSettlement(row: HTMLElement) {
  if (typeof row.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const panel = row.closest(".hermesv2-sessionpanel");
  const target = panel?.querySelector<HTMLElement>('[data-hermes-shelf="settled"] .hermesv2-shelf-title')
    ?? panel?.querySelector<HTMLElement>(".hermesv2-shelf-dock");
  const source = row.querySelector<HTMLElement>(".hermesv2-rowselect");
  if (!target || !source) return;
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "hermesv2-settlement-ghost";
  ghost.textContent = row.querySelector(".hermesv2-rowtitle")?.textContent ?? "";
  ghost.setAttribute("aria-hidden", "true");
  const computed = getComputedStyle(source);
  Object.assign(ghost.style, {
    position: "fixed", left: `${from.left}px`, top: `${from.top}px`,
    width: `${from.width}px`, height: `${from.height}px`,
    font: computed.font, padding: computed.padding, color: computed.color,
  });
  document.body.append(ghost);
  const animation = ghost.animate([
    { transform: "translateY(0)", opacity: 1 },
    { transform: `translateY(${to.top - from.top}px)`, opacity: 0 },
  ], { duration: 320, easing: "cubic-bezier(.4, 0, .2, 1)" });
  animation.onfinish = animation.oncancel = () => ghost.remove();
}
