import { notePageIconPaths } from "./notePageIconPaths.js";

/**
 * Kuratierter Katalog für Seiten-Symbole. Statt Emojis werden Material
 * Symbols (Rounded) verwendet; gespeichert wird nur der Name des Symbols.
 */
export interface NotePageIconDefinition {
  name: string;
  label: string;
  keywords: string[];
}

export const notePageIcons: NotePageIconDefinition[] = [
  { name: "description", label: "Dokument", keywords: ["dokument", "seite", "notiz", "file", "document"] },
  { name: "note_alt", label: "Notiz", keywords: ["notiz", "note", "zettel"] },
  { name: "sticky_note_2", label: "Haftnotiz", keywords: ["haftnotiz", "sticky", "zettel", "memo"] },
  { name: "article", label: "Artikel", keywords: ["artikel", "article", "text", "beitrag"] },
  { name: "menu_book", label: "Buch", keywords: ["buch", "book", "lesen", "kapitel"] },
  { name: "folder", label: "Ordner", keywords: ["ordner", "folder", "sammlung", "ablage"] },
  { name: "folder_open", label: "Ordner offen", keywords: ["ordner", "folder", "offen", "open"] },
  { name: "lightbulb", label: "Idee", keywords: ["idee", "idea", "einfall", "glühbirne", "inspiration"] },
  { name: "checklist", label: "Checkliste", keywords: ["checkliste", "checklist", "todo", "liste", "abhaken"] },
  { name: "task_alt", label: "Erledigt", keywords: ["erledigt", "done", "aufgabe", "task", "fertig"] },
  { name: "calendar_month", label: "Kalender", keywords: ["kalender", "calendar", "monat", "datum"] },
  { name: "schedule", label: "Zeitplan", keywords: ["zeit", "uhr", "schedule", "plan", "termin"] },
  { name: "person", label: "Person", keywords: ["person", "ich", "profil", "kontakt"] },
  { name: "group", label: "Team", keywords: ["team", "gruppe", "group", "menschen", "meeting"] },
  { name: "star", label: "Stern", keywords: ["stern", "star", "wichtig", "favorit"] },
  { name: "favorite", label: "Herz", keywords: ["herz", "heart", "liebe", "favorit"] },
  { name: "home", label: "Zuhause", keywords: ["zuhause", "home", "haus", "start"] },
  { name: "inbox", label: "Posteingang", keywords: ["posteingang", "inbox", "eingang", "ablage"] },
  { name: "shopping_cart", label: "Einkauf", keywords: ["einkauf", "shopping", "warenkorb", "kaufen"] },
  { name: "restaurant", label: "Essen", keywords: ["essen", "restaurant", "food", "kochen", "rezept"] },
  { name: "fitness_center", label: "Sport", keywords: ["sport", "fitness", "training", "gym", "hantel"] },
  { name: "flight", label: "Reise", keywords: ["reise", "flug", "travel", "urlaub", "flight"] },
  { name: "map", label: "Karte", keywords: ["karte", "map", "ort", "weg"] },
  { name: "school", label: "Schule", keywords: ["schule", "lernen", "school", "bildung", "studium"] },
  { name: "work", label: "Arbeit", keywords: ["arbeit", "work", "job", "büro", "akte"] },
  { name: "savings", label: "Finanzen", keywords: ["finanzen", "geld", "savings", "budget", "sparen"] },
  { name: "payments", label: "Zahlungen", keywords: ["zahlung", "payments", "geld", "rechnung"] },
  { name: "pets", label: "Haustier", keywords: ["haustier", "pets", "tier", "hund", "katze"] },
  { name: "smart_toy", label: "Roboter", keywords: ["roboter", "bot", "ki", "ai", "robot"] },
  { name: "rocket_launch", label: "Projekt", keywords: ["projekt", "project", "start", "rakete", "launch"] },
  { name: "psychology", label: "Denken", keywords: ["denken", "psychologie", "kopf", "brain", "gedanke"] },
  { name: "translate", label: "Sprache", keywords: ["sprache", "translate", "übersetzen", "language"] },
  { name: "campaign", label: "Ankündigung", keywords: ["ankündigung", "campaign", "megafon", "news"] },
  { name: "flag", label: "Flagge", keywords: ["flagge", "flag", "ziel", "meilenstein"] },
  { name: "science", label: "Forschung", keywords: ["forschung", "science", "labor", "experiment"] },
  { name: "palette", label: "Design", keywords: ["design", "palette", "farben", "kreativ"] },
  { name: "music_note", label: "Musik", keywords: ["musik", "music", "note", "song"] },
  { name: "headphones", label: "Audio", keywords: ["audio", "kopfhörer", "podcast", "hören"] },
  { name: "photo_camera", label: "Foto", keywords: ["foto", "kamera", "photo", "camera", "bild"] },
  { name: "videocam", label: "Video", keywords: ["video", "film", "kamera", "aufnahme"] },
  { name: "movie", label: "Film", keywords: ["film", "movie", "kino", "serie"] },
  { name: "sports_esports", label: "Gaming", keywords: ["gaming", "spiel", "game", "controller"] },
  { name: "attach_file", label: "Anhang", keywords: ["anhang", "datei", "file", "attachment"] },
  { name: "lock", label: "Sicherheit", keywords: ["sicherheit", "lock", "schloss", "privat", "passwort"] },
  { name: "key", label: "Schlüssel", keywords: ["schlüssel", "key", "zugang", "passwort"] },
  { name: "build", label: "Werkzeug", keywords: ["werkzeug", "tool", "build", "schraubenschlüssel"] },
  { name: "bolt", label: "Blitz", keywords: ["blitz", "bolt", "energie", "schnell", "idee"] },
  { name: "eco", label: "Natur", keywords: ["natur", "eco", "umwelt", "pflanze", "green"] },
  { name: "spa", label: "Wellness", keywords: ["wellness", "spa", "entspannung", "ruhe"] },
  { name: "bar_chart", label: "Diagramm", keywords: ["diagramm", "chart", "statistik", "zahlen"] },
  { name: "table_chart", label: "Tabelle", keywords: ["tabelle", "table", "daten", "raster"] },
  { name: "dashboard", label: "Übersicht", keywords: ["übersicht", "dashboard", "start", "panels"] },
  { name: "cloud", label: "Cloud", keywords: ["cloud", "wolke", "speicher", "online"] },
  { name: "public", label: "Welt", keywords: ["welt", "global", "internet", "world"] },
  { name: "language", label: "Webseite", keywords: ["webseite", "website", "internet", "url"] },
  { name: "mail", label: "Mail", keywords: ["mail", "email", "post", "nachricht"] },
  { name: "chat_bubble", label: "Chat", keywords: ["chat", "nachricht", "gespräch", "kommentar"] },
  { name: "link", label: "Link", keywords: ["link", "verweis", "url", "kette"] },
  { name: "bookmark", label: "Lesezeichen", keywords: ["lesezeichen", "bookmark", "merken", "speichern"] },
  { name: "edit_note", label: "Notizen", keywords: ["notizen", "schreiben", "edit", "stift"] },
  { name: "summarize", label: "Zusammenfassung", keywords: ["zusammenfassung", "summary", "überblick"] },
  { name: "coffee", label: "Kaffee", keywords: ["kaffee", "coffee", "pause", "café"] },
  { name: "celebration", label: "Feier", keywords: ["feier", "celebration", "party", "fest"] },
  { name: "cake", label: "Geburtstag", keywords: ["geburtstag", "birthday", "kuchen", "feier"] },
  { name: "health_and_safety", label: "Gesundheit", keywords: ["gesundheit", "health", "arzt", "medizin"] },
  { name: "terminal", label: "Terminal", keywords: ["terminal", "konsole", "shell", "code"] },
  { name: "code", label: "Code", keywords: ["code", "programmieren", "entwicklung", "dev"] },
  { name: "data_object", label: "Daten", keywords: ["daten", "data", "json", "struktur"] },
  { name: "travel_explore", label: "Entdecken", keywords: ["entdecken", "explore", "suche", "recherche"] },
  { name: "psychiatry", label: "Notizbuch", keywords: ["notizbuch", "journal", "tagebuch", "planung"] },
];

const byName = new Map(notePageIcons.map((icon) => [icon.name, icon]));

export const defaultNoteIconName = "description";

/** Liefert die Pfaddaten eines Symbols; unbekannte Werte (alte Emojis) ergeben null. */
export function noteIconPath(name: string | null | undefined): string | null {
  if (!name) return null;
  return notePageIconPaths[name] ?? null;
}

export function findNotePageIcon(name: string | null | undefined): NotePageIconDefinition | null {
  if (!name) return null;
  return byName.get(name) ?? null;
}

/** Suche über Label und Stichworte, Treffer am Wortanfang zuerst. */
export function searchNotePageIcons(query: string): NotePageIconDefinition[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return notePageIcons;
  const scored = notePageIcons
    .map((icon) => {
      const haystacks = [icon.label.toLowerCase(), ...icon.keywords];
      let score = 0;
      for (const value of haystacks) {
        if (value === needle) score = Math.max(score, 3);
        else if (value.startsWith(needle)) score = Math.max(score, 2);
        else if (value.includes(needle)) score = Math.max(score, 1);
      }
      return { icon, score };
    })
    .filter((entry) => entry.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.icon);
}
