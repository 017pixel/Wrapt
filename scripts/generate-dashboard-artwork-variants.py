#!/usr/bin/env python3
"""Erzeugt die Bildvarianten für das Dashboard-Hintergrund-Easter-Egg.

Die Originale in ``docs-webseite/assets`` bleiben unangetastet, weil die
Dokumentationsseite sie als Hero-Grafiken in voller Auflösung braucht. Für die
Workbench entstehen daraus zwei kleinere Stufen:

``<name>-bg.webp``
    1280 x 720 für den Vollbild-Hintergrund. Das Original ist 1672 x 941
    (1,57 Megapixel). Das Hintergrundbild wird ohnehin auf 100vh gedehnt,
    mit ``brightness(.42)`` abgedunkelt und mit ``blur(1px)`` weichgezeichnet,
    also ist die höhere Auflösung nicht sichtbar. Gemessen spart das 92 KB
    Transfer und rund 10 ms Dekodierzeit pro Motiv.

``<name>-thumb.webp``
    320 x 180 für das Auswahlraster in den Einstellungen. Ohne diese Stufe
    lädt der Easter-Egg-Tab 2,6 MB Volldateien, um 19 kleine Vorschauen zu
    zeigen. Mit ihr sind es 58 KB.

Aufruf:

    python3 scripts/generate-dashboard-artwork-variants.py [--check]

``--check`` erzeugt nichts, sondern meldet nur, ob die vorhandenen Varianten zu
den aktuellen Parametern passen. Das eignet sich für CI.

Voraussetzung: Pillow mit WebP-Unterstützung (``pip install pillow``).
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - reine Umgebungsdiagnose
    print(
        "Pillow fehlt. Installation: pip install pillow",
        file=sys.stderr,
    )
    raise SystemExit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIRECTORY = REPO_ROOT / "docs-webseite" / "assets"
TARGET_DIRECTORY = REPO_ROOT / "apps" / "web" / "src" / "assets" / "dashboard-artwork"

# Reihenfolge wie im Motiv-Katalog (apps/web/src/lib/dashboardArtwork.ts).
SOURCE_NAMES = (
    "nachthimmel-baum",
    "hero-arbeitsbereich",
    "hero-architektur",
    "hero-changelog",
    "hero-fehlerdiagnose",
    "hero-installation",
    "hero-konfigurieren",
    "hero-migration",
    "hero-mitarbeiten",
    "hero-notizen-nutzung",
    "hero-open-source",
    "hero-orbit",
    "hero-plugins-extensions",
    "hero-previews",
    "hero-sichern",
    "hero-terminal",
    "hero-ueber-wrapt",
    "hero-werkzeuge",
    "hero-zugriff-sicherheit",
)

# Zielbreite in Pixeln und WebP-Qualität. Der Hintergrund ist die einzige
# Variante, die in Originalauflösung sichtbar wäre, und wird abgedunkelt
# ausgeliefert - Qualität 72 und 1280 Pixel sind dort nicht unterscheidbar.
VARIANTS = (
    {"suffix": "-bg", "width": 1280, "quality": 72, "method": 6},
    {"suffix": "-thumb", "width": 320, "quality": 66, "method": 6},
)


def render(source: Path, variant: dict[str, object]) -> bytes:
    """Verkleiner das Quellbild auf die Zielbreite und kodiert es als WebP."""
    with Image.open(source) as image:
        if image.mode != "RGB":
            image = image.convert("RGB")
        width = int(variant["width"])
        height = round(image.height * width / image.width)
        resized = image.resize((width, height), Image.LANCZOS)
        buffer = io.BytesIO()
        resized.save(
            buffer,
            "WEBP",
            quality=int(variant["quality"]),
            method=int(variant["method"]),
        )
        return buffer.getvalue()


def catalog_motives() -> list[str]:
    """Liest die Motiv-IDs in Reihenfolge aus dem TypeScript-Katalog.

    ``SOURCE_NAMES`` hier und ``dashboardArtworks`` dort sind zwei statische
    Listen für dieselben 19 Motive. Ohne diese Prüfung meldet ``--check``
    "alles aktuell", während der Import im TypeScript ins Leere greift, sobald
    ein Motiv umbenannt oder ergänzt wird.
    """
    source = (REPO_ROOT / "apps" / "web" / "src" / "lib" / "dashboardArtwork.ts").read_text()
    start = source.find("dashboardArtworks: readonly DashboardArtwork[] = [")
    if start < 0:
        raise ValueError("Motiv-Liste im TypeScript-Katalog nicht gefunden")
    end = source.find("\n];", start)
    if end < 0:
        raise ValueError("Motiv-Liste im TypeScript-Katalog nicht abgeschlossen")
    return re.findall(r'id: "([a-z0-9-]+)"', source[start:end])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="nur prüfen, ob die vorhandenen Varianten zu den Parametern passen",
    )
    arguments = parser.parse_args()

    catalog = catalog_motives()
    if tuple(catalog) != SOURCE_NAMES:
        print("Generator und TypeScript-Katalog sind nicht synchron:", file=sys.stderr)
        print(f"  nur im Katalog: {sorted(set(catalog) - set(SOURCE_NAMES))}", file=sys.stderr)
        print(f"  nur im Generator: {sorted(set(SOURCE_NAMES) - set(catalog))}", file=sys.stderr)
        return 1

    missing = [name for name in SOURCE_NAMES if not (SOURCE_DIRECTORY / f"{name}.webp").is_file()]
    if missing:
        print(f"Fehlende Originalbilder: {', '.join(missing)}", file=sys.stderr)
        return 1

    if not arguments.check:
        TARGET_DIRECTORY.mkdir(parents=True, exist_ok=True)

    stale: list[str] = []
    written = 0
    total_bytes = 0
    for name in SOURCE_NAMES:
        source = SOURCE_DIRECTORY / f"{name}.webp"
        for variant in VARIANTS:
            target = TARGET_DIRECTORY / f"{name}{variant['suffix']}.webp"
            payload = render(source, variant)
            if arguments.check:
                if not target.is_file() or target.read_bytes() != payload:
                    stale.append(str(target.relative_to(REPO_ROOT)))
                continue
            target.write_bytes(payload)
            written += 1
            total_bytes += len(payload)

    if arguments.check:
        if stale:
            print("Veraltet oder fehlend, bitte neu erzeugen:", file=sys.stderr)
            for path in stale:
                print(f"  {path}", file=sys.stderr)
            return 1
        print(f"Alle {len(SOURCE_NAMES) * len(VARIANTS)} Varianten sind aktuell.")
        return 0

    print(
        f"{written} Varianten geschrieben, {total_bytes // 1024} KB gesamt "
        f"({TARGET_DIRECTORY.relative_to(REPO_ROOT)})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())