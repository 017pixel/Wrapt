/** Paketalias erhält die bisherige Lowlight-Grammatikversion; API ist strukturell identisch. */
declare module "highlight.js-notes/lib/languages/*" {
  import type { LanguageFn } from "highlight.js";
  const language: LanguageFn;
  export default language;
}
