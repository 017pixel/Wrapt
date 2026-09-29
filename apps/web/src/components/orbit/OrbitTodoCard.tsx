import { useMemo, useState } from "react";
import type { OrbitTodoItem } from "../../lib/orbitTodo";
import { parseOrbitTodo, serializeOrbitTodo } from "../../lib/orbitTodo";
import { useOrbitStore } from "../../stores/orbit";
import { PlusIcon, TodoIcon, TrashIcon } from "../icons";

interface OrbitTodoCardProps {
  id: string;
  title: string;
  content: string;
}

export function OrbitTodoCard({ id, title, content }: OrbitTodoCardProps) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const [draft, setDraft] = useState("");
  const items = useMemo(() => parseOrbitTodo(content), [content]);
  const completed = items.filter((item) => item.done).length;
  const saveItems = (next: OrbitTodoItem[]) => updateNode(id, { content: serializeOrbitTodo(next) });
  const addItem = () => {
    const text = draft.trim();
    if (!text || items.length >= 250) return;
    saveItems([...items, { id: globalThis.crypto.randomUUID(), text, done: false }]);
    setDraft("");
  };

  return (
    <div className="orbit-todo nodrag nowheel">
      <div className="orbit-todo-overview">
        <span>Aufgaben</span>
        <strong>{completed}<span> / {items.length}</span></strong>
      </div>
      <progress className="orbit-todo-progress" value={completed} max={Math.max(1, items.length)} aria-label="Erledigte Aufgaben" />
      <div className="orbit-todo-list" role="list" aria-label={`${title} Aufgaben`}>
        {items.map((item, index) => (
          <div className={`orbit-todo-item ${item.done ? "is-done" : ""}`} role="listitem" key={item.id}>
            <input type="checkbox" checked={item.done} aria-label={`Aufgabe ${index + 1} abhaken`} onChange={(event) => saveItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, done: event.target.checked } : candidate))} />
            <input value={item.text} aria-label={`Aufgabe ${index + 1}`} maxLength={500} onChange={(event) => saveItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate))} />
            <button type="button" aria-label={`Aufgabe ${index + 1} löschen`} onClick={() => saveItems(items.filter((candidate) => candidate.id !== item.id))}><TrashIcon className="h-4 w-4" /></button>
          </div>
        ))}
        {items.length === 0 ? <div className="orbit-todo-empty"><TodoIcon className="h-5 w-5" /><span>Keine Aufgaben</span><small>Füge unten den ersten Schritt hinzu.</small></div> : null}
      </div>
      <form className="orbit-todo-add" onSubmit={(event) => { event.preventDefault(); addItem(); }}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} aria-label="Neue Aufgabe" placeholder="Aufgabe hinzufügen…" />
        <button type="submit" aria-label="Aufgabe hinzufügen" disabled={!draft.trim() || items.length >= 250}><PlusIcon className="h-4 w-4" /></button>
      </form>
      <small>{items.length >= 250 ? "Maximal 250 Aufgaben" : `${Math.max(0, items.length - completed)} offen`}</small>
    </div>
  );
}
