import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const skillPath = resolve(
  ".agents/plugins/plugins/wrapt-extension-creator/skills/wrapt-plugins/SKILL.md",
);
const content = readFileSync(skillPath, "utf8");
const lines = content.split(/\r?\n/);
const opencodeBridgePath = resolve(".opencode/skills/wrapt-plugins/SKILL.md");
const opencodeBridge = readFileSync(opencodeBridgePath, "utf8");

const requiredSections = [
  "## Ein-Satz-Aufträge sind ausreichend",
  "## Unverhandelbare Ablage- und Zuständigkeitsgrenze",
  "## Vorprüfung und Produktvertrag",
  "## Persönlichen Draft erstellen",
  "## Persönlichen Draft bearbeiten",
  "## Lifecycle und Entfernung",
  "## Flächen, Aktionen und die generische Topbar",
  "## Neustart-Regel",
  "## Verifikation vor „fertig“",
  "## Abschlussbericht",
];
const requiredRules = [
  "name: wrapt-plugins",
  "$wrapt-plugins",
  "<dataDirectory>/plugin-drafts",
  "<dataDirectory>/extension-catalog",
  "POST /api/v1/plugins/drafts",
  "PUT /api/v1/plugins/drafts/:id",
  "DELETE /api/v1/plugins/drafts/:id",
  "expectedRevision",
  "PLUGIN_REVISION_CONFLICT",
  "PLUGIN_ACTIVE_SLUG_CHANGE",
  "activate-account",
  "tailscale-user-login",
  "44 × 44",
  "browser_navigate",
  "scripts/restart-frontend.sh",
  "expliziten Nutzerfreigabe",
  "GitHub-Upload",
  "Nicht nach dem ersten erfolgreichen API-Schreiben antworten.",
];

const errors = [];
if (lines.length > 400) errors.push(`SKILL.md hat ${lines.length} Zeilen; das Limit sind 400.`);
if (!content.startsWith("---\nname: wrapt-plugins\n")) errors.push("Frontmatter mit name: wrapt-plugins fehlt.");
for (const section of requiredSections) {
  if (!content.includes(section)) errors.push(`Abschnitt fehlt: ${section}`);
}
for (const rule of requiredRules) {
  if (!content.includes(rule)) errors.push(`Regel fehlt: ${rule}`);
}
if (/TODO|TBD|<your-/i.test(content)) errors.push("SKILL.md enthält einen unfertigen Platzhalter.");
if (!opencodeBridge.includes("kanonische") || !opencodeBridge.includes("skills/wrapt-plugins/SKILL.md")) {
  errors.push("OpenCode-Routing verweist nicht auf die kanonische Wrapt-Plugins-Anleitung.");
}

if (errors.length > 0) {
  console.error("Wrapt-Plugins-Skill ungültig:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Wrapt-Plugins-Skill gültig (${lines.length} Zeilen).`);
}
