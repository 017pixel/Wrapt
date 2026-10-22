// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  HermesV2SettingsGroup,
  HermesV2SettingsPage,
  HermesV2SettingsRow,
  HermesV2SettingsSection,
} from "./hermes-v2-settings";

afterEach(cleanup);

describe("HermesV2SettingsPage", () => {
  it("baut Kopf, Abschnitte, Gruppen und Zeilen auf", () => {
    render(
      <HermesV2SettingsPage
        title="Cron"
        area="cron"
        description="Automatisch ausgeführte Agentenläufe."
        actions={<button type="button">Cron aktualisieren</button>}
      >
        <HermesV2SettingsSection title="Jobs">
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow title="Nächtliche Zusammenfassung" description="Eigener Prompt" />
          </HermesV2SettingsGroup>
        </HermesV2SettingsSection>
      </HermesV2SettingsPage>,
    );
    const page = screen.getByRole("region", { name: "Cron" });
    expect(page.getAttribute("data-hermes-area")).toBe("cron");
    expect(screen.getByText("Automatisch ausgeführte Agentenläufe.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cron aktualisieren" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Jobs" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Jobs", level: 2 })).toBeTruthy();    expect(screen.getByRole("heading", { name: "Nächtliche Zusammenfassung", level: 3 })).toBeTruthy();
  });

  it("gibt einem Bedienelement über den Zeilentitel seinen Namen", () => {
    render(
      <HermesV2SettingsPage title="Konfiguration">
        <HermesV2SettingsSection title="Agent">
          <HermesV2SettingsGroup>
            <HermesV2SettingsRow
              title="Maximale Schritte"
              htmlFor="eigene-schritte"
              control={<input id="eigene-schritte" type="number" />}
            />
          </HermesV2SettingsGroup>
        </HermesV2SettingsSection>
      </HermesV2SettingsPage>,
    );
    expect(screen.getByRole("spinbutton", { name: "Maximale Schritte" })).toBeTruthy();
  });
});
