"""Archivio dei progetti su disco per il server locale.

Ogni progetto è un file ``<id>.pneu.json`` nella cartella dei progetti, con
``{"id", "name", "createdAt", "updatedAt", "circuit"}``. La scrittura passa da
un file temporaneo e una rinomina, così un'interruzione non lascia file a metà.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SUFFIX = ".pneu.json"
MAX_PROJECT_BYTES = 4 * 1024 * 1024


class ProjectError(ValueError):
    pass


def default_dir() -> Path:
    return Path(os.environ.get("PNEUTRACK_PROJECTS", Path.home() / "Pneutrack" / "progetti"))


class ProjectStore:
    def __init__(self, root: Path | str | None = None) -> None:
        self.root = Path(root) if root else default_dir()

    def _path(self, project_id: str) -> Path:
        if not isinstance(project_id, str) or not _ID_RE.match(project_id):
            raise ProjectError(f"id di progetto non valido: {project_id!r}")
        return self.root / f"{project_id}{SUFFIX}"

    def list(self) -> list[dict[str, Any]]:
        if not self.root.is_dir():
            return []
        out = []
        for path in self.root.glob(f"*{SUFFIX}"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            out.append({
                "id": data.get("id", path.name[: -len(SUFFIX)]),
                "name": data.get("name") or "Senza nome",
                "createdAt": data.get("createdAt"),
                "updatedAt": data.get("updatedAt"),
                "components": len((data.get("circuit") or {}).get("components") or []),
            })
        out.sort(key=lambda p: str(p.get("updatedAt") or ""), reverse=True)
        return out

    def get(self, project_id: str) -> dict[str, Any]:
        path = self._path(project_id)
        if not path.is_file():
            raise KeyError(project_id)
        return json.loads(path.read_text(encoding="utf-8"))

    def put(self, project_id: str, data: dict[str, Any]) -> dict[str, Any]:
        path = self._path(project_id)
        if not isinstance(data, dict) or not isinstance(data.get("circuit"), dict):
            raise ProjectError("il progetto deve contenere lo schema in 'circuit'")
        circuit = data["circuit"]
        if circuit.get("format", "pneutrack/circuit") != "pneutrack/circuit":
            raise ProjectError("formato dello schema non riconosciuto")
        record = {
            "id": project_id,
            "name": str(data.get("name") or circuit.get("name") or "Senza nome")[:200],
            "createdAt": data.get("createdAt"),
            "updatedAt": data.get("updatedAt"),
            "circuit": circuit,
        }
        text = json.dumps(record, ensure_ascii=False, indent=1)
        if len(text.encode()) > MAX_PROJECT_BYTES:
            raise ProjectError("progetto troppo grande")
        self.root.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.root, prefix=".tmp-", suffix=SUFFIX)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(text + "\n")
            os.replace(tmp, path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        return record

    def delete(self, project_id: str) -> None:
        path = self._path(project_id)
        if not path.is_file():
            raise KeyError(project_id)
        path.unlink()
