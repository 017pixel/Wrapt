import { useNavigate } from "react-router";
import { ExternalLinkIcon } from "../icons";

export function OrbitNodeStandaloneAction({ path }: { path: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="nodrag orbit-node-standalone"
      title="Eigenständig öffnen"
      aria-label="Werkzeug eigenständig öffnen"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); navigate(path); }}
    ><ExternalLinkIcon className="h-3.5 w-3.5" /></button>
  );
}
