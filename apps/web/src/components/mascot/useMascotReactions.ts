import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { wraptQueries } from "../../lib/queryOptions";

export type MascotReaction = "party" | "hop";

/** Merkt sich pro Browser, welcher Neustart bereits gefeiert wurde. */
const PARTY_MARKER_KEY = "wrapt.mascot.restart-party.v1";
/** Nur ein frisch beendeter Neustart wird gefeiert, kein alter Status. */
const PARTY_WINDOW_MS = 5 * 60 * 1000;
/**
 * Der Marker wird erst nach der Party gesetzt. Lädt die Seite mitten in der
 * Sequenz neu (die Neustart-Steuerung lädt nach dem Erfolg selbst neu), holt
 * die frische Seite die Feier sichtbar nach.
 */
const PARTY_MARKER_DELAY_MS = 4_000;

function readPartyMarker(): string | null {
  try {
    return window.localStorage.getItem(PARTY_MARKER_KEY);
  } catch {
    return null;
  }
}

function writePartyMarker(marker: string): void {
  try {
    window.localStorage.setItem(PARTY_MARKER_KEY, marker);
  } catch {
    // Ohne Speicher wird trotzdem gefeiert; nur ein zweites Mal bleibt möglich.
  }
}

/**
 * Beobachtet Neustart-Status und Benachrichtigungen und meldet nur echte
 * Wechsel: ein gelungener Neustart wird genau einmal gefeiert, auch wenn die
 * Seite erst nach dem Neustart geladen oder der Abschluss zwischen zwei
 * Abfragen verpasst wurde. Neu eingetroffene Benachrichtigungen lösen einen
 * kurzen Hüpfer aus.
 */
export function useMascotReactions(react: (reaction: MascotReaction) => void): void {
  const restart = useQuery(wraptQueries.restartStatus());
  const notifications = useQuery(wraptQueries.notifications());
  const reactRef = useRef(react);
  reactRef.current = react;

  const phase = restart.data?.phase;
  const updatedAt = restart.data?.updatedAt ?? null;
  const marker = restart.data?.jobId || updatedAt;
  useEffect(() => {
    if (phase !== "succeeded" || marker === null) return;
    if (readPartyMarker() === marker) return;
    const finishedAt = updatedAt ? Date.parse(updatedAt) : Number.NaN;
    if (Number.isNaN(finishedAt) || Date.now() - finishedAt > PARTY_WINDOW_MS) return;
    reactRef.current("party");
    const timer = window.setTimeout(() => writePartyMarker(marker), PARTY_MARKER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [marker, phase, updatedAt]);

  const unread = notifications.data?.unreadCount;
  const previousUnread = useRef<number | null>(null);
  useEffect(() => {
    if (unread === undefined) return;
    const previous = previousUnread.current;
    previousUnread.current = unread;
    if (previous !== null && unread > previous) reactRef.current("hop");
  }, [unread]);
}
