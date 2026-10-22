import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { OrbitNode } from "@wrapt/contracts";
import { useOrbitStore } from "../../stores/orbit";
import { hermesPathFromHostState } from "../hermes/hermes-host-path";
import { useHermesPathCallback } from "../hermes/useHermesPathCallback";

function binding(nodeId: string): readonly unknown[] {
  const { document } = useOrbitStore.getState();
  const node = document.boards.find((board) => board.id === document.activeBoardId)
    ?.nodes.find((candidate) => candidate.id === nodeId);
  return [document.activeBoardId, node?.type, node?.toolType, node?.runtimeId,
    node?.projectId, node?.state.hermesAdminPath];
}

/** Auswahl im vorhandenen Orbitdokument, mit monoton beobachteter Hostbindung. */
export function useOrbitHermesPath(node: OrbitNode, active: boolean) {
  const boardId = useOrbitStore((state) => state.document.activeBoardId);
  const path = hermesPathFromHostState(node.state) ?? "/chat";
  const [epoch, setEpoch] = useState(0);
  const observed = useRef({ binding: binding(node.id), epoch: 0 });
  useLayoutEffect(() => {
    const observe = () => {
      const next = binding(node.id);
      if (next.every((value, index) => Object.is(value, observed.current.binding[index]))) return;
      observed.current = { binding: next, epoch: observed.current.epoch + 1 };
      setEpoch(observed.current.epoch);
    };
    observe();
    return useOrbitStore.subscribe(observe);
  }, [node.id]);

  const commitPath = useCallback((next: string) => {
    if (epoch !== observed.current.epoch) return;
    const store = useOrbitStore.getState();
    if (store.document.activeBoardId !== boardId) return;
    const current = store.document.boards.find((board) => board.id === boardId)
      ?.nodes.find((candidate) => candidate.id === node.id);
    if (!current || current.type !== "tool" || current.toolType !== "hermes"
      || current.runtimeId !== node.runtimeId || current.projectId !== node.projectId
      || (hermesPathFromHostState(current.state) ?? "/chat") !== path) return;
    store.updateNode(node.id, { state: { ...current.state, hermesAdminPath: next } });
  }, [boardId, node.id, node.runtimeId, node.projectId, path, epoch]);
  const onHermesPathChange = useHermesPathCallback(`${boardId}:${node.id}`,
    active && node.type === "tool" && node.toolType === "hermes", path, commitPath);
  return { hermesAdminPath: path, onHermesPathChange };
}
