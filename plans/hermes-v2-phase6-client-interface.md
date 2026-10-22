# Phase 6: feste nonvisuelle Client-/UI-Schnittstelle

Stand 16.10.2026. Backendinterface samt gebautem Contract ausdrücklich publiziert.
Diese additive UI-Schnittstelle ist ab jetzt fest; Wire stammt ausschließlich aus
phase6-interface.md. Implementierung und unabhängige Gates folgen separat.

Bestehendes useHermesV2Chat(options), Ownerauswahl und Draftbesitz bleiben bestehen.
Alle Promise<void>-Actions resolven mit Fehler im Viewmodel. Aufgelöstes Promise
allein beweist keinen Erfolg. Kein Upload-/Mutationsretry ohne ausdrückliche Aktion.

## Additive Actions auf HermesV2Chat

```ts
setTitle(title: string): Promise<void>;
selectReasoning(effort: HermesV2Effort): Promise<void>;
uploadAttachment(file: File): Promise<void>;
removeAttachment(uploadId: string): void;
checkUpload(uploadId: string): Promise<void>;
cancelModelSelection(): void;
```

selectModel(selection,confirmed?) bleibt vorhanden. Kostenbestätigung ausschließlich
über composer.model.confirmation.selection und selectModel(selection,true).
Der Client prüft dieselbe Auswahl und denselben aktuellen Ownerkontext erneut.
Abbrechen nutzt cancelModelSelection, keine Coremutation. Deferred bedeutet keine
bereits aktive Modellwahl des laufenden Turns.

submit(text?,mode?) bleibt kompatibel und verwendet automatisch nur die ready-IDs
dieses tatsächlichen Owner-/Sessiondrafts. Leerer Text benötigt mindestens einen
ready-Anhang. resendUnknown behält Warnung und bewusste Bestätigung, prüft die
Anhangbindung neu. removeAttachment entfernt ausschließlich lokal, niemals Coredateien.
checkUpload fragt dieselbe Upload-ID bewusst ab; es startet keinen neuen Upload.
Fileobjekte/Bytes werden nie für Retry behalten. Keine Paste-/Bildqueue-/Blobpersistenz.

## Additives Viewmodel

chat-composer-types.ts exportiert die folgenden tatsächlichen TS-Typen und den
datenfreien Stubwert emptyChatComposer. HermesV2Chat erhält composer:ChatComposerView.
ChatSessionView erhält optional composer:HermesV2ComposerSettings|null,
ChatCatalogView optional hermesEfforts:readonly HermesV2Effort[], ChatMessageView
optional attachments:readonly HermesV2Attachment[]. Fehlende optionale Daten bleiben
unbekannt; keine erfundenen Approval-/Reasoningwerte oder Modellladder.

```ts
interface ChatComposerView {
  available: boolean;
  settings: HermesV2ComposerSettings | null;
  model: {
    requested: HermesV2Selection | null;
    status: 'idle'|'pending'|'confirmation'|'deferred'|'unknown';
    confirmation: {selection: HermesV2Selection;message: string} | null;
  };
  reasoning: {
    requested: HermesV2Effort | null;
    status: 'idle'|'pending'|'observed'|'unconfirmed'|'unknown';
    observed: HermesV2ComposerSettings['reasoning'] | null;
  };
  title: {
    requested: string | null;
    status: 'idle'|'pending'|'applied'|'unconfirmed'|'unknown';
    title: string | null;
  };
  attachments: readonly ChatAttachmentView[];
}
interface ChatAttachmentView {
  uploadId: string; name: string; bytes: number; mime: string;
  status: 'uploading'|'receiving'|'ready'|'unknown'|'not_sent'|'expired';
  attachment: HermesV2Attachment | null;
  error: ChatErrorInfo | null;
}
```

available verlangt eine tatsächlich vom Server gelieferte aktuelle composer-
connectionId. UI konstruiert diese nicht. Uploadmetadaten/Status gehören zum eigenen
Draft, fremde Panels verlieren weder ihre Dateien noch neueren Text durch späte
Ergebnisse. Nach Sichtbarkeits-/Owner-/Sessionwechsel wird laufender HTTPverkehr
abgebrochen; unbekannte Ergebnisse werden nicht als ready eingesetzt.

settings/observed stammen aus Coreprojektionen. Requested ist ein Wunsch,
unconfirmed ausdrücklich keine bestätigte Wirkung. Approvals bleiben global und
editable=false, kein Setter. Effort nur idle und gegen aktuelle Selection;
none nur bei ausdrücklich canDisableReasoning=true. hermesEfforts ist die allgemeine
Hermes-Ladder, keine garantierte modellbezogene Effortliste.

## Command-Domäne

chat-commands.ts exportiert resolveChatCommand(commands,key,argument='') und
ChatCommandIntent. Die UI besitzt Suche, Palette, Fuzzy, Keyboard und Layout.
Aliase verweisen auf dieselbe kanonische Zeile, uneindeutige Auswahl ist disabled.

```ts
type ChatCommandIntent =
  | {kind:'native';action:'new'|'resume'|'stop'|'model'|'help'|'title';argument:string}
  | {kind:'draft';text:string;skill:string}
  | {kind:'unsupported';reason:string};
```

Native Intents benutzt die UI über tatsächliche vorhandene Aktionen/Flächen.
Skillintent setzt eine erkennbare Agentanweisung über setDraft, sendet nie heimlich.
Queue/Steer bleiben bis Phase 7 disabled. Kein freier Dispatch oder Slash-/Shell-RPC.
Historische Dateikarten ausschließlich aus attachments auf belegten Userrows.
Download nur /api/v1/hermes/v2/attachments/<schema-validierte opaque ID>, keine
URLs/Pfade aus Nachrichtentexten. Native @file-Referenzen können im Historytext
absolute Pfade enthalten. Dies ist Dateireferenzsupport, keine native Visionzusage.

Root besitzt Shell-/ReadObserver-Fixtures und E2Es; GLM Karten/Composer/UItests.
Keine API-Namensänderung ohne Root-Abstimmung. Organisation und Phase-5-Requests
bleiben im zuvor freigegebenen Scope erhalten.
