// Modelpicker: vollständiger Katalog, Favoriten, ruhige T3-Anmutung.
import { useEffect, useState } from "react";
import type {
  HermesV2ModelCatalog,
  HermesV2Selection,
} from "@wrapt/contracts/hermes-v2";
import { Link } from "react-router";
import { ModalFrame } from "../../ModalDialog";
import "./hermes-v2-dialogs.css";
import { hermesV2ClassicHref } from "../../../lib/hermesV2Routes";
import type { ChatComposerView } from "./chat-composer-types";
import {
  browserModelFavoritesStorage,
  groupModelEntries,
  modelFavoriteKey,
  readModelFavorites,
  sameSelection,
  selectionTag,
  toggleModelFavorite,
  writeModelFavorites,
  type ModelGroup,
} from "./model-picker-data";

export interface HermesV2ModelPickerProps {
  open: boolean;
  onClose: () => void;
  catalog: HermesV2ModelCatalog | null;
  composer: ChatComposerView;
  sessionId: string | null;
  /** Beobachtete Sessionauswahl aus snapshot.selection; der Katalogcache darf alt sein. */
  observedSelection: HermesV2Selection | null;
  onSelect: (
    selection: HermesV2Selection,
    confirmed?: boolean,
  ) => void | Promise<void>;
  onCancel: () => void;
}

const MODEL_STATUS_NOTE: Record<
  ChatComposerView["model"]["status"],
  string | null
> = {
  idle: null,
  pending: "Auswahl läuft: Hermes meldet die Bestätigung, sobald sie vorliegt.",
  confirmation: null,
  deferred:
    "Vorgemerkt: Die Auswahl wird beim nächsten Turn beansprucht; der laufende Turn nutzt sie nicht.",
  unknown: "Der Ausgang der letzten Auswahl ist unklar. Bitte erneut prüfen.",
};

/**
 * Selektion ist unbestätigt; eine Corekostenbestätigung wird nur mit derselben
 * Auswahl und confirmed=true beantwortet. Abbruch läuft über cancelModelSelection,
 * ohne Coremutation. Der Dialog bleibt offen, bis der Nutzer ihn schließt;
 * Status und Bestätigungsstellung kommen aus dem echten Viewmodel.
 */
export function HermesV2ModelPicker(props: HermesV2ModelPickerProps) {
  const {
    open,
    onClose,
    catalog,
    composer,
    sessionId,
    observedSelection,
    onSelect,
    onCancel,
  } = props;
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  // Erneutes Öffnen startet ohne alten Filter; offener Dialog bewahrt die
  // aktuelle Suche, damit sie während des Blätterns nicht zurückfällt.
  // Favoriten kommen frisch aus dem Gerätespeicher.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setFavorites(readModelFavorites(browserModelFavoritesStorage()));
  }, [open]);
  if (!open) return null;
  const note = MODEL_STATUS_NOTE[composer.model.status];
  const confirm =
    composer.model.status === "confirmation"
      ? composer.model.confirmation
      : null;
  const requested = composer.model.requested;
  const toggleFavorite = (providerId: string, modelId: string) => {
    const next = toggleModelFavorite(
      favorites,
      modelFavoriteKey(providerId, modelId),
    );
    setFavorites(next);
    writeModelFavorites(browserModelFavoritesStorage(), next);
  };
  return (
    <ModalFrame open onClose={onClose} title="Modell und Anbieter">
      {() => (
        <div className="hermesv2-modelliste">
          {catalog ? (
            <>
              <input
                className="hermesv2-session-search hermesv2-model-search"
                type="search"
                aria-label="Modelle suchen"
                placeholder="Modell oder Anbieter suchen"
                value={query}
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
              <p className="hermesv2-model-current" role="status">
                {composer.model.status === "pending" && requested
                  ? `Auswahl ${selectionTag(requested)} ist in Klärung.`
                  : composer.model.status === "confirmation" && requested
                    ? `Auswahl ${selectionTag(requested)} wartet auf deine Kostenbestätigung.`
                    : observedSelection
                      ? `Aktuell: ${selectionTag(observedSelection)}`
                      : "Kein aktuelles Modell gemeldet."}
              </p>{" "}
              <ModelGroupList
                catalog={catalog}
                query={query}
                favorites={favorites}
                onSelect={(selection) =>
                  void Promise.resolve(onSelect(selection))
                }
                onToggleFavorite={toggleFavorite}
              />
            </>
          ) : (
            <p className="hermesv2-model-empty" role="status">
              Der Modellkatalog ist momentan nicht verfügbar.
            </p>
          )}
          {confirm ? (
            <ModelConfirmPane {...{ confirm, composer, onSelect, onCancel }} />
          ) : null}
          {note ? (
            <p className="hermesv2-model-status" role="status">
              {note}
            </p>
          ) : null}
          <p className="hermesv2-model-classic">
            <Link to={hermesV2ClassicHref(sessionId)}>
              Modellverwaltung der klassischen Oberfläche öffnen
            </Link>
          </p>
        </div>
      )}
    </ModalFrame>
  );
}

/** Anbietergruppen aus dem echten Katalog; Renderlimit begrenzt die Darstellung. */
function ModelGroupList({
  catalog,
  query,
  favorites,
  onSelect,
  onToggleFavorite,
}: {
  catalog: HermesV2ModelCatalog;
  query: string;
  favorites: readonly string[];
  onSelect: (selection: HermesV2Selection) => void;
  onToggleFavorite: (providerId: string, modelId: string) => void;
}) {
  const { groups, rendered, total } = groupModelEntries(catalog, query, favorites);
  return (
    <div className="hermesv2-model-groups">
      {groups.map((group) => (
        <ModelGroupSection
          key={group.provider.id}
          group={group}
          favorites={favorites}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
      {total > rendered ? (
        <p className="hermesv2-model-more" role="status">
          Über Suchen sind die weiteren {total - rendered} Modelle erreichbar.
        </p>
      ) : null}
      {total === 0 ? (
        <p className="hermesv2-model-empty" role="status">
          Kein Modell im Katalog für diesen Suchbegriff.
        </p>
      ) : null}
    </div>
  );
}

/** Eine Anbietergruppe: Favoriten zuerst, danach der Anbieter mit seinen Modellen. */
function ModelGroupSection({
  group,
  favorites,
  onSelect,
  onToggleFavorite,
}: {
  group: ModelGroup;
  favorites: readonly string[];
  onSelect: (selection: HermesV2Selection) => void;
  onToggleFavorite: (providerId: string, modelId: string) => void;
}) {
  return (
    <section
      className="hermesv2-model-provider"
      data-provider-id={group.provider.id}
    >
      <h3 className="hermesv2-model-provider-head">
        {group.favorites ? <StarIcon filled /> : null}
        {group.provider.label}
        {group.hidden ? (
          <span className="hermesv2-model-provider-count">
            +{group.hidden} über Suche
          </span>
        ) : null}
      </h3>
      {group.provider.note ? (
        <p className="hermesv2-model-provider-note">{group.provider.note}</p>
      ) : null}
      {group.empty ? (
        <p className="hermesv2-model-provider-note">
          Für diesen Anbieter wurden keine Modelle gemeldet.
        </p>
      ) : null}
      <ul className="hermesv2-model-list">
        {group.entries.map((entry) => {
          const { model } = entry;
          const favorite = favorites.includes(
            modelFavoriteKey(entry.providerId, model.id),
          );
          return (
            <li
              key={`${entry.providerId}/${model.id}`}
              className="hermesv2-model-item"
            >
              <button
                type="button"
                className="quiet-button hermesv2-model-row"
                data-provider-id={entry.providerId}
                data-model-id={model.id}
                disabled={!entry.available}
                aria-label={
                  group.favorites
                    ? `${model.label} bei ${entry.providerLabel} wählen`
                    : `${model.label} bei ${group.provider.label} wählen`
                }
                title={
                  entry.available
                    ? undefined
                    : "Dieser Anbieter ist momentan nicht verfügbar."
                }
                onClick={() =>
                  onSelect({ provider: entry.providerId, model: model.id })
                }
              >
                <span className="hermesv2-model-name">{model.label}</span>
                {model.fast ? (
                  <span className="hermesv2-model-tag">schnell</span>
                ) : null}
              </button>
              <button
                type="button"
                className="icon-button hermesv2-model-favorite"
                aria-pressed={favorite}
                aria-label={favorite ? "Favorit entfernen" : "Favorit"}
                title={
                  favorite
                    ? "Aus den Favoriten entfernen"
                    : "Als Favorit merken"
                }
                onClick={() => onToggleFavorite(entry.providerId, model.id)}
              >
                <StarIcon filled={favorite} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Stern als Favoritenmarke; Farbe und Größe kommen aus dem Textkontext. */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M12 3.8l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
    </svg>
  );
}

/** Corekostenbestätigung des tatsächlichen requested-Modells; nur dieselbe Auswahl. */
function ModelConfirmPane({
  confirm,
  composer,
  onSelect,
  onCancel,
}: {
  confirm: NonNullable<ChatComposerView["model"]["confirmation"]>;
  composer: ChatComposerView;
  onSelect: (
    selection: HermesV2Selection,
    confirmed?: boolean,
  ) => void | Promise<void>;
  onCancel: () => void;
}) {
  const same = sameSelection(confirm.selection, composer.model.requested);
  return (
    <div className="hermesv2-model-confirm" role="alert">
      <p>{confirm.message}</p>
      <div className="modal-actions">
        <button type="button" className="quiet-button" onClick={onCancel}>
          Auswahl verwerfen
        </button>
        <button
          type="button"
          className="quiet-button-primary"
          disabled={!same}
          title={
            same
              ? undefined
              : "Diese Bestätigung gehört zu einer früheren Auswahl."
          }
          onClick={() =>
            void Promise.resolve(onSelect(confirm.selection, true))
          }
        >
          Kosten bestätigen
        </button>
      </div>
    </div>
  );
}
