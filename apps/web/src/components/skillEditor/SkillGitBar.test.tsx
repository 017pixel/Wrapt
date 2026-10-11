// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkillEditorGitResponse, SkillEditorRepositoryStatus } from "@wrapt/contracts";
import { SkillGitBar } from "./SkillGitBar";

const repository: SkillEditorRepositoryStatus = { branch: "main", dirtyCount: 2 };

function result(overrides: Partial<SkillEditorGitResponse> = {}): SkillEditorGitResponse {
  return { committed: false, pushed: false, message: null, changedSkills: [], paths: [], errorTail: null, notice: null, ...overrides };
}

afterEach(cleanup);

describe("SkillGitBar", () => {
  it("zeigt einen Knopf für Commit und Push", () => {
    const onCommitAndPush = vi.fn();
    render(<SkillGitBar repository={repository} result={null} busy={false} onCommitAndPush={onCommitAndPush} />);
    expect(screen.getByText("main")).toBeTruthy();
    expect(screen.getByText("2 offene Änderungen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Commiten und Pushen auf GitHub" }));
    expect(onCommitAndPush).toHaveBeenCalledTimes(1);
  });

  it("sperrt den Knopf ohne Änderungen und bei laufender Aktion", () => {
    const { rerender } = render(<SkillGitBar repository={{ branch: "main", dirtyCount: 0 }} result={null} busy={false} onCommitAndPush={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Commiten und Pushen auf GitHub" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Nichts zu committen.")).toBeTruthy();
    rerender(<SkillGitBar repository={repository} result={null} busy onCommitAndPush={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Commiten und Pushen auf GitHub" }).hasAttribute("disabled")).toBe(true);
  });

  it("meldet abgeschlossenen Push und Fehler mit Log", () => {
    const { rerender } = render(
      <SkillGitBar repository={repository} result={result({ committed: true, pushed: true })} busy={false} onCommitAndPush={vi.fn()} />,
    );
    expect(screen.getByText("Commit und Push abgeschlossen.")).toBeTruthy();
    rerender(
      <SkillGitBar repository={repository} result={result({ message: "Push abgelehnt", errorTail: "remote: nein" })} busy={false} onCommitAndPush={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Log anzeigen" }));
    expect(screen.getByText("remote: nein")).toBeTruthy();
  });
});
