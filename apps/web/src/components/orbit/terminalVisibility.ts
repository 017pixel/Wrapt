const OVERSCAN_PX = 640;
type Listener = (visible: boolean) => void;

/** Ein Index je Canvas. Terminal-DOM und Serverruntimes bleiben bestehen. */
export class OrbitTerminalVisibility {
  private readonly listeners = new Map<HTMLElement, Set<Listener>>();
  private readonly intersections = new Map<HTMLElement, boolean>();
  private readonly heldPointers = new Map<number, HTMLElement>();
  private readonly intersection: IntersectionObserver;
  private readonly selection: MutationObserver;

  constructor(private readonly root: HTMLElement, private readonly release: () => void) {
    this.intersection = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLElement;
        if (!this.listeners.has(node)) continue;
        this.intersections.set(node, entry.isIntersecting);
        this.publish(node);
      }
    }, { root, rootMargin: `${OVERSCAN_PX}px` });
    this.selection = new MutationObserver((entries) => {
      for (const entry of entries) this.publish(entry.target as HTMLElement);
    });
    root.addEventListener("focusin", this.focus);
    root.addEventListener("focusout", this.focus);
    root.addEventListener("pointerdown", this.pointerDown, true);
  }

  subscribe(node: HTMLElement, listener: Listener): () => void {
    let subscribers = this.listeners.get(node);
    if (!subscribers) {
      subscribers = new Set();
      this.listeners.set(node, subscribers);
      const canvas = this.root.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      this.intersections.set(node, bounds.right >= canvas.left - OVERSCAN_PX && bounds.left <= canvas.right + OVERSCAN_PX
        && bounds.bottom >= canvas.top - OVERSCAN_PX && bounds.top <= canvas.bottom + OVERSCAN_PX);
      this.intersection.observe(node);
      this.selection.observe(node, { attributes: true, attributeFilter: ["class"] });
    }
    subscribers.add(listener);
    this.publish(node);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscribers.delete(listener);
      if (subscribers.size) return;
      this.listeners.delete(node);
      this.intersections.delete(node);
      this.intersection.unobserve(node);
      for (const [pointerId, held] of this.heldPointers) if (held === node) this.heldPointers.delete(pointerId);
      if (!this.heldPointers.size) this.removePointerListeners();
      // MutationObserver kennt kein unobserve. Nur die verbleibenden Nodes
      // erneut beobachten, ohne deren DOM zu verändern.
      this.selection.disconnect();
      for (const remaining of this.listeners.keys()) this.selection.observe(remaining, { attributes: true, attributeFilter: ["class"] });
      if (!this.listeners.size) this.close();
    };
  }

  private publish(node: HTMLElement): void {
    const visible = Boolean(this.intersections.get(node)) || node.matches(".selected, .dragging")
      || node.contains(document.activeElement) || [...this.heldPointers.values()].includes(node);
    for (const listener of this.listeners.get(node) ?? []) listener(visible);
  }

  private focus = (event: FocusEvent): void => {
    const node = event.target instanceof Element ? event.target.closest<HTMLElement>(".react-flow__node-orbit") : null;
    if (node) queueMicrotask(() => this.publish(node));
  };

  private pointerDown = (event: PointerEvent): void => {
    const node = event.target instanceof Element ? event.target.closest<HTMLElement>(".react-flow__node-orbit") : null;
    if (!node || !this.listeners.has(node)) return;
    this.heldPointers.set(event.pointerId, node);
    this.publish(node);
    window.addEventListener("pointerup", this.pointerEnd);
    window.addEventListener("pointercancel", this.pointerEnd);
  };

  private pointerEnd = (event: PointerEvent): void => {
    const node = this.heldPointers.get(event.pointerId);
    this.heldPointers.delete(event.pointerId);
    if (node) this.publish(node);
    if (!this.heldPointers.size) this.removePointerListeners();
  };

  private removePointerListeners(): void {
    window.removeEventListener("pointerup", this.pointerEnd);
    window.removeEventListener("pointercancel", this.pointerEnd);
  }

  private close(): void {
    this.intersection.disconnect();
    this.selection.disconnect();
    this.root.removeEventListener("focusin", this.focus);
    this.root.removeEventListener("focusout", this.focus);
    this.root.removeEventListener("pointerdown", this.pointerDown, true);
    this.removePointerListeners();
    this.heldPointers.clear();
    this.release();
  }
}

const indexes = new WeakMap<HTMLElement, OrbitTerminalVisibility>();

export function observeOrbitTerminal(mount: HTMLElement, listener: Listener): () => void {
  const node = mount.closest<HTMLElement>(".react-flow__node-orbit");
  const root = node?.closest<HTMLElement>(".orbit-flow");
  if (!node || !root || typeof IntersectionObserver === "undefined") return () => {};
  let index = indexes.get(root);
  if (!index) {
    index = new OrbitTerminalVisibility(root, () => indexes.delete(root));
    indexes.set(root, index);
  }
  return index.subscribe(node, listener);
}
