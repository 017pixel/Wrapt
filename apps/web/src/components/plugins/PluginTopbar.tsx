import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountsResponse,
  ManagedAccount,
  PluginDraftContent,
  PluginFunction,
  PluginSurfaceContribution,
} from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";

interface PluginTopbarAction {
  entry: PluginSurfaceContribution;
  action: PluginFunction;
}

interface PluginTopbarGroup {
  content: PluginDraftContent;
  actions: PluginTopbarAction[];
}

function compareAccounts(left: ManagedAccount, right: ManagedAccount): number {
  return left.label.localeCompare(right.label, "de-DE") || left.id.localeCompare(right.id);
}

function resolveManagedAccount(accounts: readonly ManagedAccount[], value: string): ManagedAccount | undefined {
  const direct = accounts.find((account) => account.id === value && account.enabled);
  if (direct) return direct;

  const [provider, position] = value.split(":");
  if (!provider || !["codex", "claude", "opencode"].includes(provider)) return undefined;
  const index = Number(position);
  if (!Number.isInteger(index) || index < 0) return undefined;
  return accounts
    .filter((account) => account.provider === provider && account.enabled)
    .slice()
    .sort(compareAccounts)[index];
}

function topbarEntries(content: PluginDraftContent): PluginSurfaceContribution[] {
  const explicit = content.surfaceContributions.filter((entry) => entry.surface === "topbar");
  if (explicit.length > 0) return explicit;
  if (!content.surfaces.includes("topbar")) return [];
  return [{
    id: "topbar-main",
    surface: "topbar",
    title: content.name,
    description: content.description,
    mobileBehavior: "same",
    token: "accent",
  }];
}

function pluginTopbarGroups(runtimes: readonly { content: PluginDraftContent }[]): PluginTopbarGroup[] {
  return runtimes
    .map(({ content }) => {
      const functions = new Map(content.functions.map((item) => [item.id, item]));
      const actions = topbarEntries(content)
        .map((entry) => ({ entry, action: functions.get(entry.id) }))
        .filter((item): item is PluginTopbarAction => item.action?.action === "activate-account");
      return { content, actions };
    })
    .filter((group) => group.actions.length > 0);
}

export function PluginTopbar() {
  const queryClient = useQueryClient();
  const runtimes = useQuery(wraptQueries.extensionRuntimes());
  const groups = useMemo(
    () => pluginTopbarGroups(runtimes.data?.runtimes.filter((item) => item.content.surfaces.includes("topbar")) ?? []),
    [runtimes.data?.runtimes],
  );
  const accounts = useQuery({ ...wraptQueries.accounts(), enabled: groups.length > 0 });
  const resolvedGroups = useMemo(() => {
    if (!accounts.data) return [];
    return groups.map((group) => ({
      ...group,
      actions: group.actions
        .map((item) => ({ ...item, account: resolveManagedAccount(accounts.data.accounts, item.action.value) }))
        .filter((item): item is PluginTopbarAction & { account: ManagedAccount } => item.account !== undefined),
    })).filter((group) => group.actions.length > 0);
  }, [accounts.data, groups]);
  const activate = useMutation({
    mutationFn: (accountId: string) => apiClient.activateAccount(accountId),
    onSuccess: (result, accountId) => {
      const provider = result?.account.provider ?? accounts.data?.accounts.find((account) => account.id === accountId)?.provider;
      if (!provider) return;
      queryClient.setQueryData<AccountsResponse>(["accounts"], (current) => current
        ? {
          ...current,
          accounts: current.accounts.map((account) => account.provider === provider
            ? { ...account, active: account.id === accountId }
            : account),
        }
        : current);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["usage"] }),
      ]);
    },
  });

  if (resolvedGroups.length === 0) return null;

  return (
    <div className="plugin-topbar-stack" role="group" aria-label="Aktive Plugin-Topbar" aria-busy={activate.isPending}>
      {resolvedGroups.map((group) => (
        <div className="plugin-topbar-group" key={group.content.slug}>
          <span className="plugin-topbar-name">{group.content.name}</span>
          <div className="plugin-topbar-options" role="group" aria-label={`${group.content.name} wählen`}>
            {group.actions.map(({ entry, account }, index) => (
              <button
                key={entry.id}
                type="button"
                className={`plugin-topbar-button ${account.active ? "is-active" : ""}`}
                aria-label={`${entry.title} wechseln (${account.label})`}
                aria-pressed={account.active}
                title={`${entry.description} · ${account.label}`}
                disabled={account.active || activate.isPending}
                onClick={() => activate.mutate(account.id)}
              >
                <span className="plugin-topbar-index">{index + 1}</span>
                <span className="plugin-topbar-copy">
                  <strong>{entry.title}</strong>
                  <small>{account.label}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {activate.isError ? <span className="plugin-topbar-error" role="alert">Nicht aktiviert</span> : null}
    </div>
  );
}
