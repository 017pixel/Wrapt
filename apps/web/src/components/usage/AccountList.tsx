import { useEffect, useState } from "react";
import type { DiscoveredAccount, ManagedAccount, UsageProviderId } from "@wrapt/contracts";
import { MoreIcon, PlusIcon, PowerIcon, UserIcon } from "../icons";
import { Badge } from "../primitives";

export type AccountGroup = [UsageProviderId, DiscoveredAccount[]];

const groupLabel: Record<UsageProviderId, string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode Go",
};

function metaFor(item: DiscoveredAccount): string {
  const parts: string[] = [];
  if (item.plan) parts.push(item.plan);
  parts.push(item.registered ? (item.source === "login" ? "Wrapt-Profil" : "Lokales Profil") : "gefunden");
  if (item.email && item.email !== item.label) parts.push(item.email);
  return parts.join(" · ");
}

export interface AccountListProps {
  groups: AccountGroup[];
  accountById: Map<string, ManagedAccount>;
  onActivate: (account: ManagedAccount) => void;
  activatePending: boolean;
  onRename: (account: ManagedAccount) => void;
  onLogin: (account: ManagedAccount) => void;
  onToggleWatch: (account: ManagedAccount) => void;
  onRemove: (account: ManagedAccount) => void;
  removePending: boolean;
  onRegister: (item: DiscoveredAccount) => void;
  registerPending: boolean;
}

export function AccountList({
  groups,
  accountById,
  onActivate,
  activatePending,
  onRename,
  onLogin,
  onToggleWatch,
  onRemove,
  removePending,
  onRegister,
  registerPending,
}: AccountListProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (!openKey) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-account-menu]")) return;
      setOpenKey(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenKey(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openKey]);

  if (groups.length === 0) {
    return (
      <div className="account-group-empty">
        <UserIcon className="h-5 w-5" />
        <strong>Keine Profile gefunden</strong>
        <span>Nutze „Neu suchen“ oder verbinde zuerst einen Account.</span>
      </div>
    );
  }

  return (
    <div className="account-groups">
      {groups.map(([provider, items]) => (
        <section className="account-group" key={provider} aria-label={groupLabel[provider]}>
          <h3 className="account-group-title">
            {groupLabel[provider]}
            <span>{items.length}</span>
          </h3>
          <ul className="account-rows">
            {items.map((item) => {
              const key = `${item.provider}:${item.profilePath}`;
              const account = item.accountId ? accountById.get(item.accountId) : undefined;
              const menuOpen = openKey === key;
              return (
                <li className={item.active ? "account-row is-active" : "account-row"} key={key}>
                  <div className="account-row-icon" aria-hidden="true">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div className="account-row-main">
                    <div className="account-row-head">
                      <strong>{item.label}</strong>
                      <span className="account-row-badges">
                        {item.active ? <Badge tone="ok">Aktiv</Badge> : null}
                        <Badge tone={item.authenticated ? "ok" : "warn"}>
                          {item.authenticated ? "angemeldet" : "Anmeldung fehlt"}
                        </Badge>
                        {item.registered && !item.enabled ? <Badge tone="warn">nicht überwacht</Badge> : null}
                      </span>
                    </div>
                    <small className="account-row-meta">{metaFor(item)}</small>
                    <code className="account-row-path" title={item.profilePath}>
                      {item.profilePath}
                    </code>
                  </div>
                  <div className="account-row-side">
                    {account ? (
                      <button
                        type="button"
                        className="account-row-activate"
                        disabled={item.active || !item.authenticated || activatePending}
                        onClick={() => onActivate(account)}
                      >
                        <PowerIcon className="h-4 w-4" />
                        {item.active ? "Aktiv" : "Aktivieren"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="quiet-button"
                        disabled={registerPending}
                        onClick={() => onRegister(item)}
                      >
                        <PlusIcon className="h-4 w-4" />
                        Registrieren
                      </button>
                    )}
                    {account ? (
                      <div className="account-row-menu" data-account-menu>
                        <button
                          type="button"
                          className="icon-button account-row-menu-trigger"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-label={`Aktionen für ${item.label}`}
                          title="Aktionen"
                          onClick={() => setOpenKey((current) => (current === key ? null : key))}
                        >
                          <MoreIcon className="h-4 w-4" />
                        </button>
                        {menuOpen ? (
                          <div className="account-menu" role="menu" aria-label={`Aktionen für ${item.label}`}>
                            <button type="button" role="menuitem" onClick={() => { setOpenKey(null); onRename(account); }}>
                              Umbenennen
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setOpenKey(null); onLogin(account); }}>
                              {account.provider === "codex" ? "Geräteanmeldung" : "Neu anmelden"}
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setOpenKey(null); onToggleWatch(account); }}>
                              {account.enabled ? "Limitüberwachung ausschalten" : "Limits überwachen"}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="is-danger"
                              disabled={removePending || item.active}
                              title={item.active ? "Der aktive Account kann nicht entfernt werden" : undefined}
                              onClick={() => { setOpenKey(null); onRemove(account); }}
                            >
                              Entfernen
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
