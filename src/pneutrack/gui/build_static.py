"""Genera una versione statica dell'editor, pubblicabile senza server.

Uso: ``python -m pneutrack.gui.build_static CARTELLA``

Copia la pagina e gli script e scrive in ``data/`` il catalogo e gli esempi; in
assenza del server l'editor usa il motore JavaScript ``js/engine.js``.
"""

from __future__ import annotations

import argparse
import json
import shutil
from importlib import resources
from pathlib import Path

from . import api


def build(out: Path) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    static = resources.files("pneutrack.gui").joinpath("static")
    with resources.as_file(static) as src:
        shutil.copytree(src, out, dirs_exist_ok=True)
    data = out / "data"
    (data / "examples").mkdir(parents=True, exist_ok=True)

    def dump(path: Path, obj: object) -> None:
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    dump(data / "catalog.json", api.catalog())
    examples = api.list_examples()
    dump(data / "examples.json", examples)
    for ex in examples:
        dump(data / "examples" / f"{ex['id']}.json", api.load_example(ex["id"]))
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m pneutrack.gui.build_static")
    parser.add_argument("out", type=Path, help="cartella di destinazione")
    args = parser.parse_args(argv)
    print(f"Editor statico in {build(args.out)}")


if __name__ == "__main__":
    main()
