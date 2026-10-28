import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { ProjectBrowserService } from "../filesystem/projectBrowserService.js";
import type { FileManagerService } from "../filesystem/fileManagerService.js";
import type { GalleryRepository } from "../filesystem/galleryRepository.js";
import type { NotesDatabase } from "../notes/database.js";
import type { PreviewSlotService } from "../previews/slots.js";
import type { createCommandService } from "../services/commandService.js";
import type { createLocalPortService } from "../services/localPortService.js";
import type { createProjectFileService } from "../services/projectFileService.js";
import type { createProjectService } from "../services/projectService.js";
import type { createServiceStatusService } from "../services/serviceStatusService.js";
import type { SkillEditorService } from "../skills/skillEditorService.js";
import type { WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import type { AccountService } from "../usage/account-service.js";
import type { UsageTimelineService } from "../usage/timeline-service.js";
import type { UsageAnalyticsService } from "../usage/usage-service.js";
import type { PluginRuntimeHub } from "../plugins/code-runtime-hub.js";

export interface RouteServices {
  pluginHub?: PluginRuntimeHub;
  projects: ReturnType<typeof createProjectService>;
  statuses: ReturnType<typeof createServiceStatusService>;
  commands: ReturnType<typeof createCommandService>;
  usage: CodexbarUsageService;
  analytics: UsageAnalyticsService;
  accounts: AccountService;
  usageTimeline: UsageTimelineService;
  notes: NotesDatabase;
  projectFiles: ReturnType<typeof createProjectFileService>;
  localPorts: ReturnType<typeof createLocalPortService>;
  previewSlots: PreviewSlotService;
  fileGallery: GalleryRepository;
  projectBrowser: ProjectBrowserService;
  identity: WorkbenchIdentityOptions;
  fileManager: FileManagerService;
  skillEditor: SkillEditorService;
  proxyOrigins: string[];
}
