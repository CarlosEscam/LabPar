"""Configuración de pruebas: base de datos SQLite temporal y banco sembrado en modo demostración."""
from __future__ import annotations

import os
import pwd
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="labpar_pruebas_"))
os.chmod(_TMP, 0o755)
os.environ.update(
    LABPAR_DATOS=str(_TMP / "datos"),
    # LABPAR_PRUEBAS_DATABASE_URL permite correr la misma suite contra PostgreSQL (la base se vacía al empezar).
    LABPAR_DATABASE_URL=os.environ.get("LABPAR_PRUEBAS_DATABASE_URL", f"sqlite:///{_TMP / 'datos' / 'pruebas.db'}"),
    LABPAR_TRABAJOS=str(_TMP / "trabajos"),
    LABPAR_CACHE=str(_TMP / "cache"),
    LABPAR_DEMO="1",
    LABPAR_SEMBRAR_AL_INICIAR="1",
    LABPAR_JWT_SECRETO="secreto-de-pruebas-con-al-menos-32-bytes-0123456789",
    LABPAR_SEUDONIMO_SECRETO="seudonimo-de-pruebas",
    LABPAR_MAX_ENVIOS_SIMULTANEOS="20",
)
# Si las pruebas corren como root y existe el usuario «alumno», se prueba también el aislamiento por usuario.
if os.geteuid() == 0:
    try:
        os.environ["LABPAR_UID_SANDBOX"] = str(pwd.getpwnam("alumno").pw_uid)
    except KeyError:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from labpar.main import app  # noqa: E402

if not os.environ["LABPAR_DATABASE_URL"].startswith("sqlite"):
    import importlib

    from labpar.db import Base, motor

    importlib.import_module("labpar.modelos")
    Base.metadata.drop_all(motor)


@pytest.fixture(scope="session")
def cliente():
    with TestClient(app) as c:
        yield c
    shutil.rmtree(_TMP, ignore_errors=True)


def _token(cliente, email: str, clave: str) -> dict[str, str]:
    r = cliente.post("/api/auth/ingresar", json={"email": email, "clave": clave})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def docente(cliente):
    return _token(cliente, "docente@labpar.local", "docente123")


@pytest.fixture(scope="session")
def admin(cliente):
    return _token(cliente, "admin@labpar.local", "admin12345")


@pytest.fixture(scope="session")
def estudiante(cliente):
    return _token(cliente, "estudiante@labpar.local", "estudiante123")


def procesar_cola() -> int:
    """Procesa todos los envíos pendientes en este proceso (equivale a un trabajador)."""
    from labpar.db import SesionLocal
    from labpar.worker import contexto_motor, procesar_envio, reclamar

    n = 0
    ctx = contexto_motor()
    with SesionLocal() as db:
        while (envio := reclamar(db, "pruebas-1")) is not None:
            procesar_envio(db, envio, ctx)
            n += 1
    return n
