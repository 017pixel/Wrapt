import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { CloseIcon, CopyIcon, DeviceRotateIcon, ExternalLinkIcon, FullscreenIcon, MoreIcon, RefreshIcon, SaveIcon } from "../icons";
import { wraptQueries } from "../../lib/queryOptions";
import { orbitDefaultNodeSize, previewSlotGeometry, useOrbitStore } from "../../stores/orbit";
import { LocalPorts } from "../preview/LocalPorts";
import { PreviewSlotFrame } from "../PreviewSlotFrame";
import { PreviewDeviceMenu } from "../preview/PreviewDeviceMenu";
import { ExternalPreviewChoice } from "../preview/ExternalPreviewChoice";
import { resolvePreviewDevice } from "../../lib/previewDevice";
import { normalizePreviewTarget } from "../../lib/previewTargets";
import { openPreviewGroupWindow } from "../../lib/previewWindow";
import { previewSlotReleasedOnTargetChange, previewSessionKeysWithNode, previewSlotsReleasedWithNode, releasePreviewSessions, releasePreviewSlots } from "../../lib/previewSlotLifecycle";
import { elementContainsEventTarget } from "../../lib/domEvents";
import { useRouteActivity } from "../../lib/routeActivity";
import { orbitPreviewSessionKeyForNode } from "../../lib/orbitPreviewIdentity";
import { FocusNodeAction, focusFromHeader } from "./OrbitNodeFocusAction";
import { useOrbitNodeRuntime, useActiveOrbitNode, EdgeHandles, OrbitNodeResizer } from "./OrbitNodeChrome";

export function PreviewGroupNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const updateNode = useOrbitStore((state) => state.updateNode);
  const setLayout = useOrbitStore((state) => state.setPreviewGroupLayout);
  const duplicateNode = useOrbitStore((state) => state.duplicateNode);
  const removeNode = useOrbitStore((state) => state.removeNode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const menuTriggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const layout = node.previewLayout ?? "1";
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!elementContainsEventTarget(menuTriggerRef.current, event.target) && !elementContainsEventTarget(menuRef.current, event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const position = () => {
      const bounds = menuTriggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setMenuStyle({ top: bounds.bottom + 4, right: Math.max(8, window.innerWidth - bounds.right) });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [menuOpen]);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const close = () => {
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    if (board) {
      void releasePreviewSlots(previewSlotsReleasedWithNode(board, id));
      void releasePreviewSessions(previewSessionKeysWithNode(board, id));
    }
    removeNode(id);
  };
  return (
    <div className={`orbit-preview-group ${selected ? "is-selected" : ""}`}>
      <OrbitNodeResizer id={id} selected={selected} minWidth={420} minHeight={300} />
      <header className="orbit-preview-group-header orbit-node-drag-handle" onDoubleClick={(event) => focusFromHeader(event, id)}>
        <input
          className="nodrag"
          value={node.title}
          aria-label="Name der Preview-Gruppe"
          onChange={(event) => updateNode(id, { title: event.target.value || "Preview-Gruppe", previewLastUsedAt: new Date().toISOString() })}
        />
        {/* Freie Fläche der Leiste bleibt Ziehgriff für die ganze Gruppe. */}
        <span className="orbit-preview-group-drag" aria-hidden />
        <div className="orbit-preview-layout nodrag" aria-label="Gruppenlayout">
          {(["1", "2", "3", "6"] as const).map((value) => <button type="button" key={value} className={layout === value ? "is-active" : ""} onClick={() => setLayout(id, value)}>{value}</button>)}
        </div>
        <FocusNodeAction id={id} />
        <button type="button" className="nodrag" title="Alle Slots neu laden" aria-label="Alle Slots neu laden" onClick={() => {
          const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
          board?.nodes.filter((slot) => slot.parentId === id).forEach((slot) => updateNode(slot.id, { content: String(Number(slot.content || "0") + 1) }));
        }}><RefreshIcon className="h-3.5 w-3.5" /></button>
        <button type="button" className="nodrag" title={fullscreen ? "Vollbild verlassen" : "Orbit mit laufenden Previews im Vollbild anzeigen"} aria-label={fullscreen ? "Vollbild verlassen" : "Vollbild"} onClick={(event) => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void event.currentTarget.closest(".react-flow")?.requestFullscreen?.();
        }}><FullscreenIcon className="h-3.5 w-3.5" /></button>
        <div className="orbit-preview-menu-wrap nodrag" ref={menuTriggerRef}>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Gruppenmenü" aria-expanded={menuOpen}><MoreIcon className="h-3.5 w-3.5" /></button>
          {menuOpen ? createPortal(<div ref={menuRef} className="orbit-preview-menu is-portal" style={menuStyle}><button type="button" onClick={() => { openPreviewGroupWindow(id, useOrbitStore.getState().document); setMenuOpen(false); }}><ExternalLinkIcon className="h-3.5 w-3.5" />Externes Fenster</button><button type="button" onClick={() => { duplicateNode(id); setMenuOpen(false); }}><CopyIcon className="h-3.5 w-3.5" />Duplizieren</button><button type="button" onClick={() => { updateNode(id, { previewLastUsedAt: new Date().toISOString() }); setMenuOpen(false); }}><SaveIcon className="h-3.5 w-3.5" />Als Vorlage merken</button></div>, document.fullscreenElement ?? document.body) : null}
        </div>
        <button type="button" className="nodrag is-danger" title="Gruppe schließen" aria-label="Gruppe schließen" onClick={close}><CloseIcon className="h-3.5 w-3.5" /></button>
      </header>
      <div className="orbit-preview-group-grid" aria-hidden />
      <EdgeHandles />
    </div>
  );
}

export function PreviewSlotNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const updateNode = useOrbitStore((state) => state.updateNode);
  const focusNode = useOrbitStore((state) => state.focusNode);
  const [targetDraft, setTargetDraft] = useState(node.previewTarget ?? "");
  const target = normalizePreviewTarget(node.previewTarget ?? "");
  const runtime = useOrbitNodeRuntime();
  const reachable = target?.kind === "external" || (target?.kind === "local" && runtime.localPorts?.ports.some((port) => port.port === target.port && port.protocol !== "unknown"));
  const stateTitle = !target ? "Kein Preview-Ziel" : reachable ? "Preview-Ziel erreichbar" : runtime.localPortsLoading ? "Erreichbarkeit wird geprüft" : "Preview-Ziel nicht erreichbar";
  const routeActive = useRouteActivity();
  const devicePreference = useQuery({ ...wraptQueries.previewDevicePreference(), enabled: routeActive });
  const resolvedDevice = resolvePreviewDevice({ deviceId: node.previewDeviceId, orientation: node.previewOrientation }, devicePreference.data);
  const deviceId = resolvedDevice.deviceId;
  const reloadKey = Number(node.content || "0");
  const saveTarget = (value: string) => {
    const normalized = normalizePreviewTarget(value);
    if (!normalized) return;
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const release = board ? previewSlotReleasedOnTargetChange(board, id) : null;
    if (release) void releasePreviewSlots([release]);
    if (board) void releasePreviewSessions(previewSessionKeysWithNode(board, id));
    updateNode(id, {
      previewTarget: normalized.kind === "local" ? String(normalized.port) : normalized.url,
      previewPath: normalized.kind === "local" ? normalized.path : "/",
      previewSlotId: null,
      previewLastUsedAt: new Date().toISOString(),
    });
    setTargetDraft(normalized.kind === "local" ? String(normalized.port) : normalized.url);
  };
  const clear = () => {
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const release = board ? previewSlotReleasedOnTargetChange(board, id) : null;
    if (release) void releasePreviewSlots([release]);
    if (board) void releasePreviewSessions(previewSessionKeysWithNode(board, id));
    updateNode(id, { previewTarget: null, previewSlotId: null });
    setTargetDraft("");
  };
  const detach = () => {
    if (!node.parentId) return;
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const group = board?.nodes.find((candidate) => candidate.id === node.parentId);
    const siblings = group ? board?.nodes.filter((candidate) => candidate.parentId === group.id && candidate.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex) : undefined;
    const slotIndex = siblings?.findIndex((candidate) => candidate.id === node.id) ?? -1;
    const geometry = group && slotIndex >= 0 ? previewSlotGeometry(group, slotIndex) : null;
    const size = geometry?.size ?? orbitDefaultNodeSize("previewSlot");
    updateNode(id, {
      parentId: null,
      position: group ? { x: group.position.x + (geometry?.position.x ?? node.position.x) + 32, y: group.position.y + (geometry?.position.y ?? node.position.y) + 32 } : node.position,
      size,
    });
  };
  return (
    <div className={`orbit-preview-slot ${selected ? "is-selected" : ""} ${node.previewIsolation ? "is-isolated" : ""}`}>
      {!node.parentId ? <OrbitNodeResizer id={id} selected={selected} minWidth={320} minHeight={240} /> : null}
      <header className="orbit-node-drag-handle" title="Preview verschieben" onDoubleClick={(event) => focusFromHeader(event, id)}>
        <span className={`orbit-preview-state ${reachable ? "is-active" : target && !runtime.localPortsLoading ? "is-error" : ""}`} title={stateTitle} />
        <input className="nodrag" value={node.title} aria-label="Slot-Label" maxLength={40} onChange={(event) => updateNode(id, { title: event.target.value || "Preview" })} />
        {node.previewIsolation ? <i title="Eigene localStorage-/IndexedDB-Session" /> : null}
        {/* Freie Fläche zieht den Slot aus der Gruppe heraus. */}
        <span className="orbit-preview-slot-drag" aria-hidden />
        <PreviewDeviceMenu
          className="nodrag"
          deviceId={node.previewDeviceId}
          orientation={node.previewOrientation}
          onSlotDeviceChange={(next) => updateNode(id, { previewDeviceId: next })}
        />
        <FocusNodeAction id={id} />
        {node.parentId ? <button type="button" className="nodrag orbit-preview-slot-detach" title="Preview aus Gruppe lösen" aria-label="Preview aus Gruppe lösen" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); detach(); }}><ExternalLinkIcon className="h-3 w-3" /></button> : null}
        {deviceId !== "responsive" ? <button type="button" className="nodrag" title="Ausrichtung drehen" onClick={() => updateNode(id, { previewOrientation: node.previewOrientation === "portrait" ? "landscape" : "portrait" })}><DeviceRotateIcon className="h-3 w-3" /></button> : null}
        <button type="button" className="nodrag" title="Slot leeren" onClick={clear}><CloseIcon className="h-3 w-3" /></button>
      </header>
      <div className="orbit-preview-slot-body nodrag nopan nowheel">
        {!target ? <div className="orbit-preview-empty">
          <form onSubmit={(event) => { event.preventDefault(); saveTarget(targetDraft); }}><input value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} placeholder="Port oder URL" aria-label="Preview-Port oder URL" /><button type="submit" disabled={!normalizePreviewTarget(targetDraft)}><ExternalLinkIcon className="h-3.5 w-3.5" />Öffnen</button></form>
          <LocalPorts compact projectId={node.projectId} allowAllPorts dataOverride={runtime.localPorts} loadingOverride={runtime.localPortsLoading} errorOverride={runtime.localPortsError} refreshOverride={runtime.refreshLocalPorts} onOpen={(port) => saveTarget(String(port.port))} />
          <small>Port-Slots trennen localStorage und IndexedDB. Cookies gelten weiterhin hostweit.</small>
        </div> : target.kind === "local" ? (
          <PreviewSlotFrame
            targetPort={target.port}
            path={node.previewPath}
            requestedSlotId={node.previewSlotId}
            isolate={node.previewIsolation}
            storageProfileId={node.previewStorageProfileId}
            previewNodeId={id}
            deviceId={node.previewDeviceId}
            orientation={node.previewOrientation}
            reloadKey={reloadKey}
            title={node.title}
            lazy
            showControls
            projectId={node.projectId}
            sessionKey={orbitPreviewSessionKeyForNode(node)}
            onSlotAssigned={(slotId) => { if (slotId !== node.previewSlotId) updateNode(id, { previewSlotId: slotId }); }}
            onOrientationChange={(next) => updateNode(id, { previewOrientation: next })}
            onFocus={() => focusNode(id)}
          />
        ) : <ExternalPreviewChoice url={target.url} />}
      </div>
      {!node.parentId ? <EdgeHandles /> : null}
    </div>
  );
}
