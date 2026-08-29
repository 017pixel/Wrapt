import { useEffect, useRef } from "react";

type CreateTerminalPane = (folderId: string | null, projectId: string | null) => unknown;

export function useAutoCreateTerminalPane(
  enabled: boolean,
  hasDocument: boolean,
  hasActivePane: boolean,
  projectId: string | null,
  create: CreateTerminalPane,
) {
  const createdRef = useRef(false);

  useEffect(() => {
    if (!enabled || !hasDocument || hasActivePane || createdRef.current) return;
    createdRef.current = true;
    create(null, projectId);
  }, [create, enabled, hasActivePane, hasDocument, projectId]);
}
