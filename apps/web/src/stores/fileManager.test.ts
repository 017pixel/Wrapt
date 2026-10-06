import { beforeEach, describe, expect, it } from "vitest";
import { useFileManagerStore } from "./fileManager";

const root = "/home/bbecker";

describe("Dateimanager-Navigation und Pfadzustand", () => {
  beforeEach(() => {
    useFileManagerStore.getState().initializeRemote({
      currentPath: root,
      history: [],
      favorites: [],
      viewMode: "list",
      sortKey: "name",
      sortDirection: "asc",
    }, 1);
    useFileManagerStore.getState().setRoot(root);
  });

  it("ignoriert die alte MRU-Historie und navigiert linear zurück", () => {
    useFileManagerStore.getState().initializeRemote({
      currentPath: root,
      history: ["/home/bbecker/projects", root, "/tmp/alter-pfad"],
      favorites: [],
      viewMode: "list",
      sortKey: "name",
      sortDirection: "asc",
    }, 2);
    expect(useFileManagerStore.getState().history).toEqual([]);

    useFileManagerStore.getState().navigateTo(`${root}/projects`, true);
    useFileManagerStore.getState().navigateTo(`${root}/projects/Wrapt`, true);
    useFileManagerStore.getState().goBack();
    expect(useFileManagerStore.getState().currentPath).toBe(`${root}/projects`);
    useFileManagerStore.getState().goBack();
    expect(useFileManagerStore.getState().currentPath).toBe(root);
    expect(useFileManagerStore.getState().history).toEqual([]);
  });

  it("schreibt Umbenennen und Löschen in Auswahl, Favoriten und Historie fort", () => {
    const project = `${root}/projects`;
    const workspace = `${project}/Wrapt`;
    useFileManagerStore.getState().navigateTo(workspace, true);
    useFileManagerStore.getState().toggleFavorite(`${workspace}/README.md`);
    useFileManagerStore.getState().select(`${workspace}/README.md`);
    useFileManagerStore.getState().setPreview(true, `${workspace}/README.md`);

    const renamed = `${project}/Wrapt`;
    useFileManagerStore.getState().replacePath(workspace, renamed);
    expect(useFileManagerStore.getState()).toMatchObject({
      currentPath: renamed,
      favorites: [`${renamed}/README.md`],
      ui: { selectedPath: `${renamed}/README.md`, previewPath: `${renamed}/README.md` },
    });

    useFileManagerStore.getState().removePath(renamed);
    expect(useFileManagerStore.getState().history).toEqual([root]);
    expect(useFileManagerStore.getState().favorites).toEqual([]);
    expect(useFileManagerStore.getState().ui).toMatchObject({ selectedPath: null, previewPath: null, previewOpen: false, detailOpen: false });
  });

  it("klappt einen Ordner samt bereits geöffneten Unterordnern ein", () => {
    const parent = `${root}/projects`;
    const child = `${parent}/Wrapt`;
    const grandchild = `${child}/apps`;
    const store = useFileManagerStore.getState();

    store.setExpanded(parent, true);
    store.setExpanded(child, true);
    store.setExpanded(grandchild, true);
    store.setExpanded(parent, false);

    expect(useFileManagerStore.getState().ui.expanded).toEqual(new Set());
  });

  it("ignoriert verspätete Poll-Antworten nach einer bestätigten Navigation", () => {
    const previous = useFileManagerStore.getState();
    const document = {
      currentPath: previous.currentPath, history: previous.history, favorites: previous.favorites,
      viewMode: previous.viewMode, sortKey: previous.sortKey, sortDirection: previous.sortDirection,
    };
    previous.navigateTo(`${root}/projects`, true);
    useFileManagerStore.getState().markSaved(3, true);
    useFileManagerStore.getState().applyRemote(document, 2);
    expect(useFileManagerStore.getState().currentPath).toBe(`${root}/projects`);
    expect(useFileManagerStore.getState().revision).toBe(3);
    useFileManagerStore.getState().applyRemote({ ...document, currentPath: `${root}/extern` }, 4);
    expect(useFileManagerStore.getState().currentPath).toBe(`${root}/extern`);
  });
});
