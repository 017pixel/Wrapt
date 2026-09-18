import { CAPYBARA_CONFETTI_FRAMES } from "./capybaraFrames";

/**
 * Konfettiregen über dem feiernden Capybara: drei Fetzenbilder fallen
 * versetzt, drehen leicht und verblassen. Läuft einmal pro Party-Frame.
 */
export function CapybaraConfetti() {
  return (
    <span className="capy-confetti" aria-hidden="true">
      {CAPYBARA_CONFETTI_FRAMES.map((source) => (
        <img key={source} className="capy-confetti-piece" src={source} alt="" draggable="false" />
      ))}
    </span>
  );
}
