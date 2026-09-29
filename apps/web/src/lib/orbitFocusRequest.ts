export interface OrbitFocusRequest {
  nodeId: string;
}

const ORBIT_FOCUS_EVENT = "orbit:focus-node";

export function requestOrbitNodeFocus(nodeId: string): void {
  window.dispatchEvent(new CustomEvent<OrbitFocusRequest>(ORBIT_FOCUS_EVENT, { detail: { nodeId } }));
}

export function listenForOrbitNodeFocus(listener: (nodeId: string) => void): () => void {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<OrbitFocusRequest>).detail;
    if (detail && typeof detail.nodeId === "string") listener(detail.nodeId);
  };
  window.addEventListener(ORBIT_FOCUS_EVENT, handle);
  return () => window.removeEventListener(ORBIT_FOCUS_EVENT, handle);
}
