import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import type { FilesystemEntry } from "@wrapt/contracts";
import { ChevronRightIcon, FolderIcon, FolderOpenIcon, FolderSearchIcon, FileIcon, LinkIcon, UnknownFileIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { parentPath } from "../../lib/fileManager";
import { useFileManagerStore } from "../../stores/fileManager";
import { useResponsiveShell } from "../../lib/useResponsiveShell";

interface FmTreeProps {
  root: string;
  currentPath: string;
}

function entryIcon(entry: FilesystemEntry, expanded: boolean) {
  if (entry.kind === "directory") return expanded ? <FolderOpenIcon className="h-3.5 w-3.5" aria-hidden /> : <FolderIcon className="h-3.5 w-3.5" aria-hidden />;
  if (entry.kind === "symlink") return <LinkIcon className="h-3.5 w-3.5" aria-hidden />;
  if (entry.kind === "file") return <FileIcon className="h-3.5 w-3.5" aria-hidden />;
  return <UnknownFileIcon className="h-3.5 w-3.5" aria-hidden />;
}

function TreeBranch({ directory, depth, expanded, currentPath, onToggle, onOpen }: {
  directory: string;
  depth: number;
  expanded: ReadonlySet<string>;
  currentPath: string;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  const tree = useQuery({
    queryKey: ["filesystem", "tree", directory],
    queryFn: ({ signal }) => apiClient.filesystemTreeAll(directory, signal),
    staleTime: 30_000,
  });
  const entries = tree.data?.entries ?? [];
  const loading = tree.isLoading || tree.isFetching;
  const children = entries.filter((entry) => entry.kind === "directory" && entry.readable);

  if (loading && entries.length === 0) {
    return <div className="file-manager-tree-skeleton"><span /><span /><span /><span /></div>;
  }
  if (tree.isError && entries.length === 0) {
    return <p className="file-manager-tree-error">Der Ordner konnte nicht geladen werden.</p>;
  }

  return <>
    {children.map((entry) => {
      const isExpanded = expanded.has(entry.path);
      const isOpen = currentPath === entry.path;
      return <div key={entry.path}>
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={isExpanded}
          aria-selected={isOpen}
          data-fm-tree-row
          data-path={entry.path}
          tabIndex={-1}
          className={`file-manager-tree-row ${isOpen ? "is-open" : ""}`}
          style={{ "--fm-depth": depth } as CSSProperties}
          onClick={() => onOpen(entry.path)}
        >
          <button
            type="button"
            className="file-manager-tree-toggle"
            aria-label={`${entry.name} ${isExpanded ? "einklappen" : "aufklappen"}`}
            onClick={(event) => { event.stopPropagation(); onToggle(entry.path); }}
          >
            <ChevronRightIcon className={`file-manager-tree-chevron ${isExpanded ? "is-open" : ""}`} />
          </button>
          <span className="file-manager-tree-icon">{entryIcon(entry, isExpanded)}</span>
          <span className="file-manager-tree-name" title={entry.name}>{entry.name}</span>
        </div>
        {isExpanded ? <TreeBranch directory={entry.path} depth={depth + 1} expanded={expanded} currentPath={currentPath} onToggle={onToggle} onOpen={onOpen} /> : null}
      </div>;
    })}
  </>;
}

export function FmTree({ root, currentPath }: FmTreeProps) {
  const responsive = useResponsiveShell();
  const expanded = useFileManagerStore((state) => state.ui.expanded);
  const setExpanded = useFileManagerStore((state) => state.setExpanded);
  const navigateTo = useFileManagerStore((state) => state.navigateTo);
  const select = useFileManagerStore((state) => state.select);
  const setPreview = useFileManagerStore((state) => state.setPreview);
  const setDetailOpen = useFileManagerStore((state) => state.setDetailOpen);
  const setTreeOpen = useFileManagerStore((state) => state.setTreeOpen);

  const onToggle = useCallback((path: string) => {
    setExpanded(path, !expanded.has(path));
  }, [expanded, setExpanded]);

  const onOpen = useCallback((path: string) => {
    if (path === currentPath) {
      setExpanded(path, !expanded.has(path));
      return;
    }
    navigateTo(path, true);
    setExpanded(path, true);
    select(null);
    setPreview(false);
    setDetailOpen(false);
    if (responsive.isTouchShell) setTreeOpen(false);
  }, [currentPath, expanded, navigateTo, responsive.isTouchShell, select, setDetailOpen, setExpanded, setPreview, setTreeOpen]);

  const isAtRoot = currentPath === root;

  // Navigation aus Breadcrumbs, Inhalt oder Remote-Sync öffnet den Pfad
  // einmalig. Danach bleibt ein erneuter Klick ein echtes Einklappen.
  useEffect(() => {
    if (!root || !currentPath.startsWith(`${root}/`)) return;
    let path = currentPath;
    while (path.startsWith(`${root}/`)) {
      setExpanded(path, true);
      path = parentPath(path);
    }
  }, [currentPath, root, setExpanded]);

  return <nav className="file-manager-tree" role="tree" aria-label="Server-Dateibaum">
    <div
      role="treeitem"
      aria-level={1}
      aria-selected={isAtRoot}
      data-fm-tree-row
      data-path={root}
      tabIndex={-1}
      className={`file-manager-tree-row file-manager-tree-home-row ${isAtRoot ? "is-open" : ""}`}
      style={{ "--fm-depth": 0 } as CSSProperties}
      onClick={() => onOpen(root)}
    >
      <span className="file-manager-tree-toggle file-manager-tree-toggle-spacer" aria-hidden="true" />
      <span className="file-manager-tree-icon"><FolderSearchIcon className="h-3.5 w-3.5" aria-hidden /></span>
      <span className="file-manager-tree-name">Home</span>
    </div>
    <TreeBranch directory={root} depth={1} expanded={expanded} currentPath={currentPath} onToggle={onToggle} onOpen={onOpen} />
  </nav>;
}
