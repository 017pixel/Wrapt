import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type webPush from "web-push";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationPreferencesSchema } from "@wrapt/contracts";
import { NotificationDatabase } from "./database.js";
import { NotificationPushService } from "./push.js";
import { registerNotificationRoutes } from "./routes.js";

const directories: string[] = [];
const apps: Array<ReturnType<typeof Fastify>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Report-Rate-Limit (S-009)", () => {
  it("drosselt POST /notifications/report auf 10/Minute", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-report-limit-")); directories.push(directory);
    const notifications = new NotificationDatabase(join(directory, "wrapt.sqlite"));
    const sendNotification = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} })) as unknown as typeof webPush.sendNotification;
    const push = new NotificationPushService({
      databasePath: join(directory, "wrapt.sqlite"), dataDirectory: directory, subject: "mailto:test@example.com",
      notifications, sendNotification,
      preferences: notificationPreferencesSchema.parse({ pushEnabled: false }),
      validateEndpoint: () => undefined,
    });
    const app = Fastify(); apps.push(app);
    await app.register(rateLimit, { max: 1_000, timeWindow: "1 minute" });
    await app.register(registerNotificationRoutes, {
      prefix: "/api/v1", database: notifications, push, configDirectory: directory,
      identity: { allowedUsers: [] },
    });
    app.addHook("onClose", async () => { await push.close(); notifications.close(); });
    await app.ready();

    const payload = { title: "Absturz", body: "Details", remoteId: "run-1", report: { message: "Fehler" } };
    const statuses: number[] = [];
    for (let index = 0; index < 30; index += 1) {
      const response = await app.inject({ method: "POST", url: "/api/v1/notifications/report", payload });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(201));
    expect(statuses[10]).toBe(429);
    expect(statuses.slice(10)).toEqual(new Array(20).fill(429));
  });
});
