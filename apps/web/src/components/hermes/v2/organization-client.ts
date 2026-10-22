import type { z } from "zod";
import {
  hermesV2SummaryPageSchema, hermesV2SummaryLookupSchema, hermesV2SummaryLookupResultSchema,
  hermesV2OrganizationBatchSchema, hermesV2MembersPageSchema, hermesV2NoticesPageSchema,
  hermesV2ReadAckSchema, hermesV2ReadResultSchema, hermesV2OrganizeSchema, hermesV2ReorderSchema,
  hermesV2UndoSchema, hermesV2OrganizationMutationSchema, hermesV2OrganizationConflictSchema,
  hermesV2CatalogQuerySchema, type HermesV2CatalogQuery, type HermesV2OrganizationMutation, type HermesV2MembersPage,
} from "@wrapt/contracts/hermes-v2";
import { ChatError } from "./gateway-protocol";
import { organizationPolicy } from "./organization-policy";
import { readOrganizationResponse } from "./organization-response";
import { isCatalogDepthEnd } from "./organization-pagination";
import type { MemberShelf, SidebarActionIntent, SidebarReorderIntent } from "./sidebar-types";

export class OrganizationConflict extends ChatError {
  constructor(readonly data: z.infer<typeof hermesV2OrganizationConflictSchema>) {
    super("ORGANIZATION_CONFLICT", "Die Organisation wurde inzwischen geändert. Der aktuelle Stand wurde geladen.");
  }
}
export class OrganizationClient {
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  private async request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, body?: unknown, mutation = false): Promise<T> {
    if (signal.aborted) throw new ChatError("V2_DISABLED", "Die Hermes-Fläche ist nicht mehr aktiv.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, organizationPolicy.requestTimeoutMs);
    let sent = false;
    try {
      sent = true;
      const response = await this.fetcher(`/api/v1/hermes/v2/${path}`, { method: body === undefined ? "GET" : "POST",
        credentials: "same-origin", headers: body === undefined ? {} : { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
      const value = await readOrganizationResponse(response, controller, mutation);
      if (controller.signal.aborted) throw new ChatError("STALE_READ", "Die Organisationsantwort wurde verworfen.", mutation ? "unknown" : "not_sent");
      if (response.status === 409) {
        const conflict = hermesV2OrganizationConflictSchema.safeParse(value);
        if (conflict.success) throw new OrganizationConflict(conflict.data);
      }
      if (!response.ok) {
        const code = value && typeof value === "object" && "code" in value ? value.code : null;
        if (code === "READ_EVIDENCE_EXPIRED" || code === "READ_EVIDENCE_INVALID") throw new ChatError(code, "Der Lesebeleg muss durch eine frische Chatprojektion ersetzt werden.");
        const messages: Record<string, string> = { OPEN_REQUEST: "Bitte zuerst die offene Anfrage beantworten. Danach kann die Sitzung zurückgestellt werden.",
          PIN_LIMIT: "Die maximale Anzahl angepinnter Sitzungen ist erreicht.", INVALID_SNOOZE: "Der Snooze-Zeitpunkt ist ungültig oder liegt nicht in der erlaubten Zukunft." };
        if (typeof code === "string" && Object.hasOwn(messages, code)) throw new ChatError(code, messages[code]!);
        throw new ChatError(response.status === 403 ? "FORBIDDEN" : "ORGANIZATION_FAILED", "Die Hermes-Organisation konnte nicht geladen oder geändert werden.");
      }
      const parsed = schema.safeParse(value);
      if (!parsed.success) throw new ChatError("PROTOCOL_MISMATCH", "Die Organisationsantwort ist nicht kompatibel.", mutation ? "unknown" : "not_sent");
      if (controller.signal.aborted) throw new ChatError("STALE_READ", "Die Organisationsantwort wurde verworfen.", mutation ? "unknown" : "not_sent");
      return parsed.data;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError("ORGANIZATION_OFFLINE", "Die Verbindung zur Hermes-Organisation wurde unterbrochen.", mutation && sent ? "unknown" : "not_sent");
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }
  async catalog(query: HermesV2CatalogQuery, signal: AbortSignal) {
    query = hermesV2CatalogQuerySchema.parse(query);
    const params = new URLSearchParams({ offset: `${query.offset}`, limit: `${query.limit}` });
    if (query.q) params.set("q", query.q);
    if (query.projectId) params.set("projectId", query.projectId);
    const result = await this.request(`sessions?${params}`, hermesV2SummaryPageSchema, signal);
    if (result.offset !== query.offset || result.limit !== query.limit || result.sessions.length > query.limit
      || (query.projectId !== undefined && result.sessions.some((session) => session.projectId !== query.projectId))
      || (result.hasMore && result.nextOffset !== query.offset + query.limit && !(result.nextOffset === null && isCatalogDepthEnd(result)))
      || Object.keys(result.activity).some((id) => !result.sessions.some((session) => session.id === id))) throw new ChatError("PROTOCOL_MISMATCH", "Die Katalogantwort gehört zu einer anderen Seite.");
    return result;
  }
  async lookup(ids: readonly string[], signal: AbortSignal) {
    const body = hermesV2SummaryLookupSchema.parse({ sessionIds: [...ids] });
    const result = await this.request("sessions/lookup", hermesV2SummaryLookupResultSchema, signal, body);
    const returned = [...result.sessions.map((session) => session.id), ...result.missingSessionIds];
    if (returned.length !== ids.length || new Set(returned).size !== ids.length || returned.some((id) => !ids.includes(id))
      || Object.keys(result.activity).some((id) => !result.sessions.some((session) => session.id === id))) throw new ChatError("PROTOCOL_MISMATCH", "Der Sitzungskatalog enthält eine andere Sitzung.");
    return result;
  }
  async metadata(ids: readonly string[], signal: AbortSignal) {
    const params = new URLSearchParams();
    for (const id of ids) params.append("sessionId", id);
    const result = await this.request(`organization?${params}`, hermesV2OrganizationBatchSchema, signal);
    if (result.length !== ids.length || result.some((item, index) => item.sessionId !== ids[index])) throw new ChatError("PROTOCOL_MISMATCH", "Die Metadaten enthalten eine andere Sitzung.");
    return result;
  }
  async members(group: MemberShelf, cursor: string | null, signal: AbortSignal): Promise<HermesV2MembersPage> {
    const params = new URLSearchParams({ group, limit: `${organizationPolicy.pageSize}` });
    if (cursor) params.set("cursor", cursor);
    const result = await this.request(`organization/members?${params}`, hermesV2MembersPageSchema, signal);
    if (result.group !== group) throw new ChatError("PROTOCOL_MISMATCH", "Die Mitgliederliste gehört zu einer anderen Gruppe.");
    return result;
  }
  async notices(sessionId: string, cursor: string | null, signal: AbortSignal) {
    const params = new URLSearchParams({ sessionId, limit: `${organizationPolicy.pageSize}` });
    if (cursor) params.set("cursor", cursor);
    const result = await this.request(`organization/notices?${params}`, hermesV2NoticesPageSchema, signal);
    if (result.sessionId !== sessionId) throw new ChatError("PROTOCOL_MISMATCH", "Die Hinweise gehören zu einer anderen Sitzung.");
    if (result.items.some((item) => item.kind === "unavailable-content" && item.readEvidence !== null)) throw new ChatError("PROTOCOL_MISMATCH", "Ein nicht verfügbarer Inhalt darf keinen Lesebeleg tragen.");
    return result;
  }
  read(sessionId: string, evidence: readonly string[], signal: AbortSignal) {
    return this.request("organization/read", hermesV2ReadResultSchema, signal, hermesV2ReadAckSchema.parse({ sessionId, evidence: [...evidence] }));
  }
  async action(intent: SidebarActionIntent, signal: AbortSignal): Promise<HermesV2OrganizationMutation> {
    const result = await this.request("organization/action", hermesV2OrganizationMutationSchema, signal, hermesV2OrganizeSchema.parse(intent), true);
    if (result.items.length !== 1 || result.items[0]?.sessionId !== intent.sessionId) throw new ChatError("PROTOCOL_MISMATCH", "Die Organisationsantwort gehört zu einer anderen Sitzung.", "unknown");
    return result;
  }
  async reorder(intent: SidebarReorderIntent, signal: AbortSignal): Promise<HermesV2OrganizationMutation> {
    const result = await this.request("organization/reorder", hermesV2OrganizationMutationSchema, signal,
      hermesV2ReorderSchema.parse({ ...intent, entries: [...intent.entries] }), true);
    const requested = new Set(intent.entries.map((entry) => entry.sessionId));
    const returned = new Set(result.items.map((item) => item.sessionId));
    if (requested.size !== intent.entries.length || result.items.length !== requested.size || returned.size !== requested.size
      || result.items.some((item) => !requested.has(item.sessionId))) throw new ChatError("PROTOCOL_MISMATCH", "Die Reorderantwort enthält nicht die vollständige angeforderte Pinmenge.", "unknown");
    return result;
  }
  undo(handle: string, signal: AbortSignal): Promise<HermesV2OrganizationMutation> {
    return this.request("organization/undo", hermesV2OrganizationMutationSchema, signal, hermesV2UndoSchema.parse({ handle }), true);
  }
}
