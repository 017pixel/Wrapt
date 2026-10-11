import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { ErrorIcon } from "./icons";
import { reportCrash } from "../lib/crashReport";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Erscheint in der Ersatzansicht, damit man sieht, welcher Teil ausgefallen ist. */
  label?: string;
  /**
   * Nur für nicht-kritische Inseln (z. B. Hinweise, Badges): Bei Fehler bleibt
   * die Fläche still leer, der Crash-Dialog meldet sich trotzdem. Für
   * Hauptinhalte und Shell-Segmente (Navigation, Kopfbereich, Statusleiste)
   * niemals silent verwenden — dort braucht es immer eine Ersatzansicht mit
   * „Erneut versuchen".
   */
  silent?: boolean;
  /** Läuft vor dem Zurücksetzen, z. B. zum Leeren eines Lazy-Modul-Caches. */
  onRetry?: (() => void) | undefined;
}

interface ErrorBoundaryState {
  failed: boolean;
  /** Zähler je manuellem Retry: erzwingt ein Neu-Einhängen der Kinder. */
  attempt: number;
}

/**
 * Fängt Renderfehler ab, damit ein kaputtes Teilstück nicht die ganze Oberfläche
 * weißfärbt. Der Fehler geht an den Crash-Report, der Rest der App läuft weiter.
 *
 * Retry läuft nur per Klick („Erneut versuchen"), nie automatisch: Wirft die
 * Komponente erneut, bleibt die Ersatzansicht stabil stehen statt zu loopen.
 * Der attempt-Zähler hängt die Kinder neu ein, onRetry kann zusätzlich einen
 * zwischengespeicherten Lazy-Import verwerfen (siehe DeferredRoute).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    // attempt bleibt erhalten: Der nächste Retry bump den Zähler erneut und
    // hängt die Kinder damit wieder frisch ein.
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportCrash({ kind: "render", error, componentStack: info.componentStack ?? null });
  }

  private readonly retry = () => {
    this.props.onRetry?.();
    this.setState((current) => ({ failed: false, attempt: current.attempt + 1 }));
  };

  override render() {
    if (!this.state.failed) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    if (this.props.silent) return null;
    return (
      <div className="boundary-fallback" role="alert">
        <ErrorIcon className="h-6 w-6 shrink-0 text-bad" />
        <div>
          <strong>{this.props.label ?? "Dieser Bereich"} konnte nicht angezeigt werden.</strong>
          <span>Der Crash-Report steht im Fenster darüber — kopieren und einem KI-Agenten geben.</span>
        </div>
        <div className="boundary-fallback-actions">
          <button type="button" className="quiet-button" onClick={this.retry}>Erneut versuchen</button>
          <button type="button" className="quiet-button" onClick={() => window.location.reload()}>Neu laden</button>
        </div>
      </div>
    );
  }
}
