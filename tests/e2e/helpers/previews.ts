/**
 * Preview-Tests brauchen eine erlaubte Tailscale-Identität. Sie kommt aus
 * `WRAPT_E2E_USER` beziehungsweise `WRAPT_DEV_TAILSCALE_USER`; ohne
 * hinterlegten Benutzer überspringen sich die Tests, statt an `401` zu scheitern.
 */
import { e2eOrigin } from "./environment";

const identity = process.env.WRAPT_E2E_USER ?? process.env.WRAPT_DEV_TAILSCALE_USER ?? "user@example.com";

export const previewsEnabled = identity.length > 0;

export const previewsReason =
  "Setze WRAPT_E2E_USER auf eine in `tailscale.allowedUsers` erlaubte Adresse.";

export const previewIdentity: Record<string, string> = {
  "tailscale-user-login": identity,
  // Mutierende Endpunkte verlangen eine gültige Same-Origin-Anfrage.
  origin: e2eOrigin,
};
