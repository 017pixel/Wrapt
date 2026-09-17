import { CAPYBARA_ZZZ_FRAMES } from "./capybaraFrames";

/**
 * Schwebende Zzz über dem schlafenden Capybara: erst klein und tief, dann
 * größer und weiter oben, am Ende verblasst der jeweilige Frame.
 */
export function CapybaraZzz() {
  return (
    <span className="capy-zzz" aria-hidden="true">
      {CAPYBARA_ZZZ_FRAMES.map((source, index) => (
        <img
          key={source}
          className={`capy-zzz-letter capy-zzz-${index + 1}`}
          src={source}
          alt=""
          draggable="false"
        />
      ))}
    </span>
  );
}
