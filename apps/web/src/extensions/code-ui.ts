import type { PluginClientRegistration, PluginUiContribution, PluginUiEditor, PluginUiSurface } from "@wrapt/plugin-sdk/client";
import { contributionIdSchema, routePathSchema } from "@wrapt/extension-contracts";

interface Transform { owner: string; surface: PluginUiSurface; priority: number; apply(editor: PluginUiEditor): void }

/** Beiträge bleiben unverändert gespeichert; Transformationen sind beim Entladen reversibel. */
export class CodePluginUiRegistry {
  private readonly contributions = new Map<string, { owner: string; value: PluginUiContribution }>();
  private readonly transforms = new Set<Transform>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private readonly resolving = new Set<PluginUiSurface>();
  private readonly inspected = new Map<PluginUiSurface, readonly PluginUiContribution[]>();
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.revision;
  readonly invalidate = () => { this.revision += 1; for (const listener of this.listeners) listener(); };

  register(owner: string, value: PluginUiContribution): PluginClientRegistration {
    if (!contributionIdSchema.safeParse(value.id).success || !value.id.startsWith(`${owner}.`) || this.contributions.has(value.id)) throw new Error("UI-Beiträge benötigen eine eindeutige ID im Plugin-Namensraum.");
    this.validate([value]);
    if (value.surface === "page" && value.path && [...this.contributions.values()].some((entry) => entry.value.surface === "page" && entry.value.path === value.path)) throw new Error("Diese Plugin-Route ist bereits registriert.");
    this.contributions.set(value.id, { owner, value: Object.freeze({ ...value }) });
    this.invalidate();
    return { dispose: () => { this.contributions.delete(value.id); this.invalidate(); } };
  }

  transform(owner: string, surface: PluginUiSurface, apply: Transform["apply"], priority = 0): PluginClientRegistration {
    const transform = { owner, surface, apply, priority };
    this.transforms.add(transform);
    this.invalidate();
    return { dispose: () => { this.transforms.delete(transform); this.invalidate(); } };
  }

  resolve(surface: PluginUiSurface, builtins: readonly PluginUiContribution[] = []): readonly PluginUiContribution[] {
    if (this.resolving.has(surface)) throw new Error("UI-Transformationen dürfen dieselbe Fläche nicht rekursiv auflösen.");
    this.resolving.add(surface);
    try {
      let values = [...builtins.map((value) => ({ ...value })), ...[...this.contributions.values()].map((item) => item.value).filter((value) => value.surface === surface)];
      const hidden = new Set<string>();
      const editor: PluginUiEditor = {
        list: () => values.map((value) => Object.freeze({ ...value })),
        get: (id) => { const value = values.find((item) => item.id === id); return value && Object.freeze({ ...value }); },
        hide: (id) => { hidden.add(id); },
        remove: (id) => { values = values.filter((item) => item.id !== id); },
        update: (id, changes) => { values = values.map((item) => item.id === id ? { ...item, ...changes, id, surface } : item); },
        replace: (id, contribution) => { values = values.map((item) => item.id === id ? { ...contribution, id, surface } : item); },
      };
      for (const transform of [...this.transforms].filter((entry) => entry.surface === surface).sort((a, b) => a.priority - b.priority || a.owner.localeCompare(b.owner))) {
        const before = values;
        const hiddenBefore = new Set(hidden);
        try { transform.apply(editor); this.validate(values); }
        catch { values = before; hidden.clear(); for (const id of hiddenBefore) hidden.add(id); }
      }
      const result = values.filter((item) => !hidden.has(item.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
      this.inspected.set(surface, Object.freeze(result));
      return result;
    } finally { this.resolving.delete(surface); }
  }

  inspect(): readonly PluginUiContribution[] { return [...this.inspected.values()].flat(); }
  ownerOf(id: string): string | undefined { return this.contributions.get(id)?.owner; }
  private validate(values: readonly PluginUiContribution[]): void {
    const paths = new Set<string>();
    for (const value of values) {
      if (typeof value.title !== "string" || value.path !== undefined && !routePathSchema.safeParse(value.path).success) throw new Error("UI-Titel und lokale Routen müssen gültig sein. Verwende kleine Buchstaben, Bindestriche und Schrägstriche im Pfad.");
      if (value.surface === "page" && value.path) {
        if (paths.has(value.path)) throw new Error("Mehrere Seiten beanspruchen dieselbe Route.");
        paths.add(value.path);
      }
    }
  }
  removeOwner(owner: string): void {
    for (const [id, value] of this.contributions) if (value.owner === owner) this.contributions.delete(id);
    for (const value of this.transforms) if (value.owner === owner) this.transforms.delete(value);
    this.invalidate();
  }
}

export const codePluginUi = new CodePluginUiRegistry();
