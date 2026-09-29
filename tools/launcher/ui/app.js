const invoke = window.__TAURI__.core.invoke;
const elements = Object.fromEntries([
  "status-dot", "status-title", "status-detail", "version", "boot-id", "ownership",
  "repository", "log-path", "feedback", "open-workbench", "start-server", "stop-server",
  "restart-server", "save-path", "open-logs", "autostart",
].map((id) => [id, document.getElementById(id)]));

let currentRepository = "";
let refreshing = false;

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const status = await invoke("get_status");
    render(status);
    if (elements.autostart.dataset.ready !== "true") {
      elements.autostart.checked = await invoke("get_autostart");
      elements.autostart.dataset.ready = "true";
    }
  } catch (error) {
    showFeedback(String(error), true);
  } finally {
    refreshing = false;
  }
}

function render(status) {
  currentRepository = status.repository;
  if (document.activeElement !== elements.repository) elements.repository.value = status.repository;
  elements.logPath.textContent = status.logFile;
  elements.version.textContent = status.version ?? "—";
  elements.bootId.textContent = status.bootId ?? "—";
  elements.ownership.textContent = status.ownership === "managed"
    ? "Launcher"
    : status.ownership === "external" ? "Extern" : "—";
  elements.statusDot.className = `status-dot ${status.reachable ? "online" : status.ownership === "managed" ? "pending" : "offline"}`;
  elements.statusTitle.textContent = status.reachable ? "Wrapt ist erreichbar" : status.ownership === "managed" ? "Wrapt startet" : "Wrapt ist nicht erreichbar";
  elements.statusDetail.textContent = status.ownership === "external"
    ? "Läuft außerhalb dieses Launchers"
    : status.ownership === "managed" ? "Wird von diesem Launcher verwaltet" : "127.0.0.1:3010";
  elements.openWorkbench.disabled = !status.reachable;
  elements.startServer.disabled = status.reachable || status.ownership === "managed";
  elements.stopServer.disabled = status.ownership !== "managed";
  elements.restartServer.disabled = status.ownership === "external";
  if (status.lastError) showFeedback(status.lastError, true);
}

function showFeedback(message, isError = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle("error", isError);
}

async function action(name, ...args) {
  showFeedback("Bitte warten …");
  try {
    showFeedback(await invoke(name, ...args));
  } catch (error) {
    showFeedback(String(error), true);
  }
  await refresh();
}

elements.openWorkbench.addEventListener("click", () => action("open_workbench"));
elements.startServer.addEventListener("click", () => action("start_server"));
elements.stopServer.addEventListener("click", () => action("stop_server"));
elements.restartServer.addEventListener("click", () => action("restart_server"));
elements.openLogs.addEventListener("click", () => action("open_logs"));
elements.savePath.addEventListener("click", () => {
  const repoPath = elements.repository.value.trim();
  if (!repoPath || repoPath === currentRepository) return showFeedback("Der Repository-Pfad ist unverändert.");
  action("set_repository_path", { repoPath });
});
elements.autostart.addEventListener("change", async () => {
  try {
    elements.autostart.checked = await invoke("set_autostart", { enabled: elements.autostart.checked });
    showFeedback(elements.autostart.checked ? "Autostart ist aktiviert." : "Autostart ist deaktiviert.");
  } catch (error) {
    showFeedback(String(error), true);
    elements.autostart.checked = !elements.autostart.checked;
  }
});

refresh();
window.setInterval(refresh, 2500);
