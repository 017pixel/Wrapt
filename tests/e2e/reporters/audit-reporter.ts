import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * Macht Skip- und Retry-Zahlen sichtbar. Ein grüner Lauf mit verdeckten
 * Retry-Erfolgen oder begründungslosen Skips ist damit kein stilles Signal
 * mehr: Der Bericht landet als JSON und Markdown unter test-results/.
 */
const FLAKY_BUDGET = 1;
const OUTPUT_DIRECTORY = "test-results";
const JSON_FILE = "e2e-summary.json";
const MARKDOWN_FILE = "e2e-summary.md";

interface Bucket { passed: number; failed: number; skipped: number; flaky: number; }

function emptyBucket(): Bucket {
  return { passed: 0, failed: 0, skipped: 0, flaky: 0 };
}

export default class AuditReporter implements Reporter {
  private startedAt = Date.now();
  private readonly totals = emptyBucket();
  private readonly byProject = new Map<string, Bucket>();
  private readonly skipReasons = new Map<string, number>();
  private readonly flakes: Array<{ title: string; project: string; retries: number }> = [];
  private readonly failures: Array<{ title: string; project: string; error: string }> = [];

  onBegin() {
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent.project()?.name ?? "unbekannt";
    const bucket = this.byProject.get(project) ?? emptyBucket();
    this.byProject.set(project, bucket);
    const title = test.titlePath().join(" › ");

    if (result.status === "skipped") {
      this.totals.skipped += 1;
      bucket.skipped += 1;
      const reason = test.annotations.find((annotation) => annotation.type === "skip")?.description?.trim() || "ohne Begründung";
      this.skipReasons.set(reason, (this.skipReasons.get(reason) ?? 0) + 1);
      return;
    }
    if (result.status === "passed" && result.retry > 0) {
      this.totals.flaky += 1;
      bucket.flaky += 1;
      this.flakes.push({ title, project, retries: result.retry });
      return;
    }
    if (result.status === "passed") {
      this.totals.passed += 1;
      bucket.passed += 1;
      return;
    }
    this.totals.failed += 1;
    bucket.failed += 1;
    this.failures.push({ title, project, error: (result.error?.message ?? "Unbekannter Fehler").split("\n")[0] ?? "" });
  }

  onEnd(result: FullResult) {
    const summary = {
      status: result.status,
      startedAt: new Date(this.startedAt).toISOString(),
      durationMs: Date.now() - this.startedAt,
      flakyBudget: FLAKY_BUDGET,
      totals: { ...this.totals },
      byProject: Object.fromEntries([...this.byProject.entries()].sort(([left], [right]) => left.localeCompare(right))),
      skipReasons: [...this.skipReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count),
      flakes: this.flakes,
      failures: this.failures,
    };
    mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
    writeFileSync(join(OUTPUT_DIRECTORY, JSON_FILE), `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(join(OUTPUT_DIRECTORY, MARKDOWN_FILE), renderMarkdown(summary));

    process.stdout.write(
      `\nE2E-Bericht: ${this.totals.passed} bestanden, ${this.totals.failed} fehlgeschlagen, `
      + `${this.totals.skipped} übersprungen, ${this.totals.flaky} Flakes (Budget ${FLAKY_BUDGET}).\n`,
    );
    if (this.totals.flaky > FLAKY_BUDGET) {
      process.stdout.write(`Flake-Budget überschritten: ${this.flakes.map((flake) => `${flake.project}: ${flake.title}`).join("; ")}\n`);
      process.exitCode = 1;
    }
  }
}

function renderMarkdown(summary: {
  status: string;
  durationMs: number;
  flakyBudget: number;
  totals: Bucket;
  byProject: Record<string, Bucket>;
  skipReasons: Array<{ reason: string; count: number }>;
  flakes: Array<{ title: string; project: string; retries: number }>;
  failures: Array<{ title: string; project: string; error: string }>;
}): string {
  const lines = [
    "# E2E-Bericht",
    "",
    `Status: ${summary.status} · Dauer: ${Math.round(summary.durationMs / 1000)} s · Flake-Budget: ${summary.flakyBudget}`,
    "",
    "| Projekt | Bestanden | Fehlgeschlagen | Übersprungen | Flakes |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...Object.entries(summary.byProject).map(([project, bucket]) => `| ${project} | ${bucket.passed} | ${bucket.failed} | ${bucket.skipped} | ${bucket.flaky} |`),
    "",
    "## Skip-Gründe",
    "",
    ...(summary.skipReasons.length > 0 ? summary.skipReasons.map((entry) => `- ${entry.count}× ${entry.reason}`) : ["- keine"]),
    "",
    "## Flakes (Retry-Erfolge)",
    "",
    ...(summary.flakes.length > 0 ? summary.flakes.map((flake) => `- ${flake.project}: ${flake.title} (${flake.retries} Retries)`) : ["- keine"]),
    "",
    "## Fehler",
    "",
    ...(summary.failures.length > 0 ? summary.failures.map((failure) => `- ${failure.project}: ${failure.title} — ${failure.error}`) : ["- keine"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
