import type { HermesV2OrganizationMutation } from "@wrapt/contracts/hermes-v2";
import { ChatError, errorInfo } from "./gateway-protocol";
import { OrganizationConflict } from "./organization-client";
import type { OrganizationOwner } from "./organization-owner";
import type { OrganizationRuntime } from "./organization-runtime";
import { planSidebarDrop, validPinReorder } from "./sidebar-dnd";
import { resolveSnooze } from "./sidebar-time";
import { organizationPolicy } from "./organization-policy";
import type { HermesV2SidebarActions, SidebarActionIntent, SidebarReorderIntent } from "./sidebar-types";

export class OrganizationActions {
  constructor(private readonly runtime: OrganizationRuntime) {}
  forOwner(id: string): HermesV2SidebarActions {
    const withOwner = async (work: (owner: OrganizationOwner, valid: () => boolean) => Promise<void>) => {
      const owner = this.runtime.owners.get(id);
      if (!owner || !this.runtime.valid(owner)) return;
      const valid = this.runtime.capture(owner), current = this.runtime.capture();
      try { await work(owner, valid); } catch (error) { if (valid()) owner.error = errorInfo(error); }
      if (current()) this.runtime.emitAll();
    };
    const organize = (intent: SidebarActionIntent) => withOwner((owner) => this.mutate(owner, [intent.sessionId], () => this.runtime.client.action(intent, this.runtime.signal)));
    const reorder = (intent: SidebarReorderIntent) => withOwner(async (owner) => {
      if (!validPinReorder(intent, this.runtime.pins(), this.runtime.pinsComplete(), this.runtime.state.pinRevision)) throw new ChatError("ORGANIZATION_CONFLICT", "Die vollständige Pin-Liste hat sich geändert. Bitte neu laden.");
      await this.mutate(owner, intent.entries.map((entry) => entry.sessionId), () => this.runtime.client.reorder(intent, this.runtime.signal));
    });
    return {
      setQuery: (query) => {
        const owner = this.runtime.owners.get(id);
        if (!owner || !this.runtime.valid(owner)) return;
        owner.query = query.slice(0, 200); owner.ids = [];
        void this.runtime.queries.catalog(owner, true);
      },
      refresh: () => withOwner(async (owner, valid) => {
        const queryGeneration = owner.queryGeneration + 1;
        const current = () => valid() && owner.queryGeneration === queryGeneration;
        if (!await this.runtime.queries.catalog(owner, true) || !current()) return;
        for (const group of ["pinned", "snoozed", "settled"] as const) {
          if (!current()) return;
          await this.runtime.queries.members(group, true, current);
          if (!current()) return;
        }
        if (!current()) return;
        await owner.read?.refresh();
      }),
      loadMore: () => withOwner(async (owner) => { await this.runtime.queries.catalog(owner); }),
      loadMembers: (group) => withOwner(async (_owner, valid) => { await this.runtime.queries.members(group, false, valid); }),
      setCollapsed: (group, collapsed) => {
        if (!this.runtime.enabled()) return;
        this.runtime.preferences.set(group, collapsed); this.runtime.emitAll();
        if (!collapsed && group !== "working") void withOwner(async (_owner, valid) => { await this.runtime.queries.members(group, false, valid); });
      },
      organize,
      previewSnooze: (input) => resolveSnooze(input, this.runtime.clock.now()),
      snooze: (sessionId, expectedRevision, input) => withOwner(async (owner) => {
        const result = resolveSnooze(input, this.runtime.clock.now());
        if (!result.ok) throw new ChatError(result.code, result.message);
        await this.mutate(owner, [sessionId], () => this.runtime.client.action({ sessionId, expectedRevision, action: "snooze", snoozedUntil: result.until }, this.runtime.signal));
      }),
      preparePinnedReorder: () => withOwner(async (_owner, valid) => {
        await this.runtime.queries.members("pinned", true, valid);
        if (!valid()) return;
        const seen = new Set<string | null>();
        while (!this.runtime.pinsComplete() && this.runtime.state.members.pinned.hasMore) {
          if (!valid()) return;
          const before = this.runtime.state.members.pinned;
          const cursor = before.cursor, count = before.ids.length;
          if (seen.has(cursor) || seen.size >= organizationPolicy.maxMembers) throw new ChatError("PROTOCOL_MISMATCH", "Die Pin-Liste hat keinen gültigen Fortschritt.");
          seen.add(cursor);
          await this.runtime.queries.members("pinned", false, valid);
          if (!valid()) return;
          const after = this.runtime.state.members.pinned;
          if (!this.runtime.pinsComplete() && (after.cursor === cursor || after.ids.length <= count)) throw new ChatError("PROTOCOL_MISMATCH", "Die Pin-Liste hat keinen gültigen Fortschritt.");
        }
        if (!valid()) return;
        if (!this.runtime.pinsComplete()) throw new ChatError("ORGANIZATION_CONFLICT", "Die vollständige Pin-Liste konnte nicht bestätigt werden.");
      }),
      planDrop: (sessionId, target, before) => {
        const row = this.runtime.state.rows([sessionId], this.runtime.clock.now())[0];
        return row ? planSidebarDrop(row, target, this.runtime.pins(), this.runtime.pinsComplete(), this.runtime.state.pinRevision, before)
          : { allowed: false, reason: "Die Sitzung ist nicht mehr geladen." };
      },
      executeDrop: (plan) => plan.allowed ? plan.kind === "action" ? organize(plan.command) : reorder(plan.command) : Promise.resolve(),
      reorderPinned: reorder,
      undo: () => withOwner(async (owner) => {
        const undo = owner.undo;
        if (!undo || undo.expiresAt <= this.runtime.clock.now()) throw new ChatError("UNDO_EXPIRED", "Diese Änderung kann nicht mehr rückgängig gemacht werden.");
        owner.undo = null;
        await this.mutate(owner, [], () => this.runtime.client.undo(undo.handle, this.runtime.signal));
      }),
      clearError: () => { const owner = this.runtime.owners.get(id); if (owner) { owner.error = null; this.runtime.emit(owner); } },
    };
  }
  private async mutate(owner: OrganizationOwner, ids: readonly string[], send: () => Promise<HermesV2OrganizationMutation>): Promise<void> {
    if (ids.some((id) => owner.busy.has(id))) return;
    const cycle = this.runtime.cycle;
    const ownerValid = this.runtime.capture(owner), current = this.runtime.capture();
    if (!ownerValid()) return;
    ids.forEach((id) => owner.busy.add(id)); owner.error = null; this.runtime.emit(owner);
    try {
      const result = await send();
      if (!current()) return;
      this.runtime.clock.sample(result.serverNow); this.runtime.state.mergeMetadata(result.items);
      if (!ownerValid()) return;
      owner.undo = result.undo;
      await this.runtime.queries.lookup(result.items.map((item) => item.sessionId), false, ownerValid);
    } catch (error) {
      if (cycle !== this.runtime.cycle) return;
      if (error instanceof OrganizationConflict) {
        this.runtime.clock.sample(error.data.serverNow); this.runtime.state.mergeMetadata(error.data.items);
        this.runtime.state.advancePinRevision(error.data.pinRevision);
      }
      throw error;
    } finally { ids.forEach((id) => owner.busy.delete(id)); }
  }
}
