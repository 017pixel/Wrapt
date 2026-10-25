/** Übersetzt die zentrale Wrapt-Palette in VS-Code-Farbwerte. */
export function themeFromCss(css) {
  const block = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1];
  if (!block) throw new Error("Wrapt-Theme-Tokens fehlen.");
  const token = (name) => {
    const raw = block.match(new RegExp(`--color-${name}:\\s*([^;]+);`))?.[1]?.trim();
    if (!raw) throw new Error(`Wrapt-Farbtoken fehlt: ${name}`);
    if (raw.startsWith("#")) return raw;
    const rgb = raw.match(/^rgb\(255 255 255 \/ ([.\d]+)\)$/);
    if (rgb) return `#ffffff${Math.round(Number(rgb[1]) * 255).toString(16).padStart(2, "0")}`;
    const lch = raw.match(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/);
    if (!lch) throw new Error(`Nicht unterstütztes Farbformat: ${name}`);
    // OKLCH -> OKLab -> lineares sRGB, anschließend sRGB-Transferfunktion.
    const light = Number(lch[1]) / 100;
    const angle = Number(lch[3]) * Math.PI / 180;
    const a = Number(lch[2]) * Math.cos(angle), b = Number(lch[2]) * Math.sin(angle);
    const l = (light + .3963377774 * a + .2158037573 * b) ** 3;
    const m = (light - .1055613458 * a - .0638541728 * b) ** 3;
    const s = (light - .0894841775 * a - 1.291485548 * b) ** 3;
    const channels = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
      -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
    return `#${channels.map((value) => Math.round(Math.min(1, Math.max(0,
      value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055)) * 255).toString(16).padStart(2, "0")).join("")}`;
  };
  const colors = {};
  const assign = (names, name) => names.forEach((key) => { colors[key] = token(name); });
  assign(["editor.background", "editorGroupHeader.tabsBackground", "tab.inactiveBackground", "statusBar.background", "statusBar.noFolderBackground"], "ink-950");
  assign(["sideBar.background", "activityBar.background", "titleBar.activeBackground", "titleBar.inactiveBackground", "panel.background"], "ink-900");
  assign(["editorWidget.background", "dropdown.background", "menu.background", "quickInput.background"], "ink-850");
  assign(["foreground", "editor.foreground", "tab.activeForeground", "button.foreground"], "text");
  assign(["descriptionForeground", "tab.inactiveForeground", "statusBar.foreground", "editorLineNumber.foreground"], "muted");
  assign(["button.background", "focusBorder", "progressBar.background", "tab.activeBorder", "activityBar.activeBorder", "editorCursor.foreground"], "accent");
  assign(["list.hoverBackground", "toolbar.hoverBackground", "editor.lineHighlightBackground"], "ink-800");
  assign(["editorGroup.border", "panel.border", "sideBar.border", "widget.border"], "ink-600");
  assign(["editorError.foreground"], "bad");
  assign(["editorWarning.foreground"], "warn");
  assign(["editorInfo.foreground"], "info");
  for (const key of ["scrollbarSlider.background", "scrollbarSlider.hoverBackground", "scrollbarSlider.activeBackground", "scrollbar.shadow"]) {
    colors[key] = `${token("ink-950")}00`;
  }
  return { name: "Wrapt Dark", type: "dark", semanticHighlighting: true, colors, tokenColors: [] };
}
