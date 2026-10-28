// Befüllt die laufende Screenshot-Instanz über deren HTTP-API mit reinen
// Dummy-Daten: Erscheinungsbild, Dummy-Accounts, Nutzung und Notizen.
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const SCREENSHOT_IDENTITY = "screenshot@example.com";

async function api(baseUrl, path, { method = "GET", body, identity = SCREENSHOT_IDENTITY } = {}) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      accept: "application/json",
      "tailscale-user-login": identity,
      "x-wrapt-sync-version": "2",
      // Mutierende Preview-Aufrufe verlangen Same-Origin; der Seed spricht die
      // isolierte Instanz direkt an.
      origin: new URL(baseUrl).origin,
      "sec-fetch-site": "same-origin",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} fehlgeschlagen: ${response.status} ${await response.text()}`);
  if (response.status === 204) return undefined;
  return response.json();
}

const notes = [
  {
    title: "Arbeitsbereich",
    content: "# Arbeitsbereich\n\nAlles, was gerade auf dem Tisch liegt. Untergeordnete Notizen sind hier gebündelt.\n",
    children: [
      { title: "Onboarding-Checkliste", content: "Bereit für die erste Session.\n\n## Setup\n\n- [x] Tailscale-Gerät verbinden\n- [x] Erstes Projekt registrieren\n- [ ] T3 Code koppeln\n- [ ] Erste Preview öffnen\n\n## Nächster Schritt\n\nThread am Handy öffnen und den letzten Commit prüfen.\n\n> Notizen und Preview bleiben direkt im Workspace.\n" },
      { title: "Release 1.23 vorbereiten", content: "## Ziele\n\n- [x] Changelog schreiben\n- [ ] Screenshots erneuern\n- [ ] Landingpage bauen\n\n> Der Stichtag ist Donnerstag, 14 Uhr.\n" },
    ],
  },
  { title: "T3-Code Tastenkürzel", content: "# T3-Code Tastenkürzel\n\n| Kürzel | Wirkung |\n| --- | --- |\n| Strg + K | Befehlspalette |\n| Strg + P | Datei öffnen |\n\n> Alles bleibt lokal, es gehen keine Daten an Dritte.\n" },
  { title: "Preview-Slots: Ideen", content: "# Preview-Slots: Ideen\n\n- [ ] Feste Slots pro Projekt\n- [ ] Getrennte Storage-Profile\n- [x] Log-Ansicht je Dienst\n\n> Cookies bleiben gemeinsam, Storage ist getrennt.\n" },
  { title: "Kundenportal Nordlicht", content: "# Kundenportal Nordlicht\n\nZählerstände, Rechnungen und Störungsmeldungen an einem Ort.\n\n- [x] Prototyp\n- [ ] Feinschliff der Startseite\n" },
  { title: "Wochenrückblick KW 39", content: "# Wochenrückblick KW 39\n\n- Terminal-Design verbessert\n- Nutzungslimits sichtbar gemacht\n- Notizstruktur aufgeräumt\n" },
];

async function seedNotes(baseUrl) {
  const existing = await api(baseUrl, "/notes");
  if (existing.notes.length > 0) return existing.notes;
  const created = [];
  for (const entry of notes) {
    const parent = entry.children ? (await api(baseUrl, "/notes", { method: "POST", body: { title: entry.title } })).note : null;
    if (parent) {
      const saved = await api(baseUrl, `/notes/${parent.id}/content`, { method: "PUT", body: { content: entry.content, expectedRevision: parent.revision } });
      created.push(saved.note);
      for (const child of entry.children) {
        const note = (await api(baseUrl, "/notes", { method: "POST", body: { title: child.title, parentId: parent.id } })).note;
        const result = await api(baseUrl, `/notes/${note.id}/content`, { method: "PUT", body: { content: child.content, expectedRevision: note.revision } });
        created.push(result.note);
      }
    } else {
      const note = (await api(baseUrl, "/notes", { method: "POST", body: { title: entry.title } })).note;
      const result = await api(baseUrl, `/notes/${note.id}/content`, { method: "PUT", body: { content: entry.content, expectedRevision: note.revision } });
      created.push(result.note);
    }
  }
  return created;
}

async function seedAccounts(baseUrl, profilePaths, databasePath) {
  const existing = await api(baseUrl, "/accounts");
  if (existing.accounts.length > 0) return;
  const created = {};
  for (const [key, provider] of [["codex-arbeit", "codex"], ["codex-privat", "codex"], ["opencode-demo", "opencode"]]) {
    const label = key === "codex-arbeit" ? "arbeit" : key === "codex-privat" ? "privat" : "opencode-demo";
    created[key] = (await api(baseUrl, "/accounts", { method: "POST", body: { provider, label, profilePath: profilePaths[key], source: "local" } })).account;
  }
  await api(baseUrl, `/accounts/${created["codex-arbeit"].id}/activate`, { method: "POST" });
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA busy_timeout=5000");
    database.prepare("UPDATE accounts SET email=? WHERE id=?").run("demo@example.com", created["opencode-demo"].id);
    database.close();
  } catch {
    // Die E-Mail ist nur Kosmetik; ein belegter Fixture-Datensatz darf den Seed nicht abbrechen.
  }
}

export async function seedScreenshotData({ baseUrl, root, profilePaths }) {
  // Erscheinungsbild gilt bei jedem Start: Der Starter schreibt die Config
  // neu, ohne diese PUTs ginge das Maskottchen nach einem Neustart verloren.
  await api(baseUrl, "/system/appearance", { method: "PUT", body: { preset: "t3-code" } }).catch(() => undefined);
  // Capybara-Easter-Egg für die Aufnahmen: Das Maskottchen sitzt dann in der
  // Statusleiste und gehört auf den Bildern sichtbar dazu.
  await api(baseUrl, "/system/mascot", { method: "PUT", body: { mascot: { enabled: true, scale: 1 } } }).catch(() => undefined);
  const marker = join(root, "data", "screenshot-seeded");
  try {
    await access(marker);
    return { skipped: true };
  } catch {
    // Noch nicht befüllt.
  }
  await api(baseUrl, "/system/usage-monitoring", { method: "PUT", body: { monitoring: { codex: true, opencode: true, claude: false } } }).catch(() => undefined);
  await seedAccounts(baseUrl, profilePaths, join(root, "data", "wrapt.sqlite"));
  await api(baseUrl, "/usage/sync", { method: "POST" }).catch(() => undefined);
  await seedNotes(baseUrl);
  for (const projectId of ["nordlicht", "feldnotiz", "sandkasten"]) {
    await api(baseUrl, `/projects/${projectId}/activity`, { method: "POST" }).catch(() => undefined);
  }
  // Echter Dev-Server für ein lebendiges Preview-Bild; scheitert er, bleibt die
  // gefüllte Hub-Ansicht als Rückfall.
  await api(baseUrl, "/previews/dev-servers/nordlicht/start", { method: "POST", body: {} }).catch(() => undefined);
  await writeFile(marker, new Date().toISOString());
  return { skipped: false };
}
