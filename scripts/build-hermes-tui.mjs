#!/usr/bin/env node
import { parseArgs } from "node:util";
import { buildHermesTui } from "./hermes/build-tui.mjs";

const { values } = parseArgs({ options: { checkout: { type: "string" }, out: { type: "string" } } });
if (!values.checkout || !values.out) throw new Error("--checkout und --out sind erforderlich.");
const result = await buildHermesTui({ checkout: values.checkout, out: values.out });
console.log(result.optimized
  ? "Hermes-TUI gebaut: Chatverlauf wird beim Tippen nicht erneut aufgebaut."
  : "Hermes-TUI gebaut: unveränderter offizieller Renderer, Anpassung für diese Version nicht freigegeben.");
