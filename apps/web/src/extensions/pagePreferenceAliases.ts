/**
 * Persistierte v2 Preference Keys bleiben absichtlich stabil. Sie sind Daten,
 * keine Runtime Ownership und werden auf die aktuellen Extension Pages abgebildet.
 */
export const pagePreferenceAliases = Object.freeze({
  dashboard: "wrapt.dashboard.page.main",
  workbench: "wrapt.orbit.page.main",
  projects: "wrapt.projects.page.list",
  "t3-code": "wrapt.t3-code.page.main",
  "hermes-agent": "wrapt.hermes.page.main",
  codex: "wrapt.codex.page.main",
  opencode: "wrapt.opencode.page.main",
  claude: "wrapt.claude.page.main",
  "code-editor": "wrapt.code-server.page.main",
  previews: "wrapt.previews.page.main",
  terminal: "wrapt.terminal.page.main",
  files: "wrapt.files.page.main",
  "ki-skills": "wrapt.skills.page.main",
  plugins: "wrapt.plugins.page.main",
  usage: "wrapt.usage.page.main",
  settings: "wrapt.settings.page.main",
});
