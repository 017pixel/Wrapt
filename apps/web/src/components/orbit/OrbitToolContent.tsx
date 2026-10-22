import type { OrbitNode, Panel, Project, Service } from "@wrapt/contracts";
import { codeServerState } from "../../lib/codeServerAvailability";
import { useRouteActivity } from "../../lib/routeActivity";
import { ToolPanel } from "../ToolPanel";
import { useOrbitHermesPath } from "./useOrbitHermesPath";

interface OrbitToolContentProps {
  node: OrbitNode;
  project: Project | undefined;
  services: Service[];
  selected: boolean;
  zoom: number;
  onFocus: () => void;
}

/** Werkzeuginhalt; Orbit behält Chrome, Auswahl und bestehende Persistenz. */
export function OrbitToolContent({ node, project, services, selected, zoom, onFocus }: OrbitToolContentProps) {
  const routeActive = useRouteActivity();
  const { hermesAdminPath, onHermesPathChange } = useOrbitHermesPath(node, routeActive && selected);
  const type = node.toolType ?? "terminal";
  const previewId = type === "preview" ? (node.previewId ?? project?.previews[0]?.id ?? null) : node.previewId;
  const panel: Panel = {
    id: type === "hermes" ? node.id : node.runtimeId ?? node.id,
    type, projectId: node.projectId, previewId, reloadKey: 0,
    ...(type === "hermes" ? { hermesAdminPath } : {}),
  };
  const codeServerMode = services.find((service) => service.id === "code-server")?.mode ?? "external";
  return <ToolPanel
    panel={panel}
    project={project}
    codeServerMode={codeServerMode}
    codeServerState={codeServerState(services)}
    isFocused={selected}
    minimal
    terminalRenderScale={zoom}
    terminalRuntimeId={node.runtimeId}
    {...(type === "hermes" ? { onHermesPathChange } : {})}
    onFocus={onFocus}
  />;
}
