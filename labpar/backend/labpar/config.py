"""Configuración de la plataforma a partir de variables de entorno (prefijo LABPAR_)."""
from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("labpar")

RAIZ_BACKEND = Path(__file__).resolve().parent.parent


def _texto(nombre: str, defecto: str | None = None) -> str | None:
    valor = os.environ.get(f"LABPAR_{nombre}")
    return valor if valor not in (None, "") else defecto


def _booleano(nombre: str, defecto: bool) -> bool:
    valor = _texto(nombre)
    if valor is None:
        return defecto
    return valor.strip().lower() in {"1", "true", "si", "sí", "yes", "on"}


def _entero(nombre: str, defecto: int | None) -> int | None:
    valor = _texto(nombre)
    if valor is None:
        return defecto
    return int(valor)


def _secreto_persistente(directorio: Path, nombre_archivo: str, variable: str) -> str:
    """Usa la variable de entorno si existe; si no, genera un secreto y lo guarda en el directorio de datos."""
    valor = _texto(variable)
    if valor:
        return valor
    ruta = directorio / nombre_archivo
    try:
        if ruta.exists():
            return ruta.read_text(encoding="utf-8").strip()
        directorio.mkdir(parents=True, exist_ok=True)
        nuevo = secrets.token_urlsafe(48)
        ruta.write_text(nuevo, encoding="utf-8")
        os.chmod(ruta, 0o600)
        log.warning("LABPAR_%s no está definido: se generó un secreto local en %s", variable, ruta)
        return nuevo
    except OSError:
        log.warning("No se pudo persistir %s; se usa un secreto temporal", nombre_archivo)
        return secrets.token_urlsafe(48)


@dataclass(frozen=True)
class Config:
    directorio_datos: Path
    database_url: str
    jwt_secreto: str
    jwt_horas: int
    seudonimo_secreto: str
    cors_origenes: tuple[str, ...]
    registro_abierto: bool
    modo_demo: bool
    sembrar_al_iniciar: bool
    admin_email: str
    admin_clave: str | None
    directorio_frontend: Path | None
    institucion: str
    contacto_datos: str
    # Motor de evaluación
    trabajadores: int
    uid_sandbox: int | None
    gid_sandbox: int | None
    directorio_trabajos: Path
    directorio_cache: Path
    max_hilos_ejecucion: int
    max_envios_simultaneos: int
    tiempo_maximo_trabajo_s: int


def cargar_config() -> Config:
    datos = Path(_texto("DATOS", str(RAIZ_BACKEND / "datos"))).resolve()
    datos.mkdir(parents=True, exist_ok=True)
    url = _texto("DATABASE_URL", f"sqlite:///{datos / 'labpar.db'}")
    frontend = _texto("FRONTEND")
    nucleos = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)
    return Config(
        directorio_datos=datos,
        database_url=url,
        jwt_secreto=_secreto_persistente(datos, ".jwt_secreto", "JWT_SECRETO"),
        jwt_horas=_entero("JWT_HORAS", 12) or 12,
        seudonimo_secreto=_secreto_persistente(datos, ".seudonimo_secreto", "SEUDONIMO_SECRETO"),
        cors_origenes=tuple(
            o.strip() for o in (_texto("CORS", "http://localhost:5173,http://127.0.0.1:5173") or "").split(",") if o.strip()
        ),
        registro_abierto=_booleano("REGISTRO_ABIERTO", True),
        modo_demo=_booleano("DEMO", False),
        sembrar_al_iniciar=_booleano("SEMBRAR_AL_INICIAR", True),
        admin_email=(_texto("ADMIN_EMAIL", "admin@labpar.local") or "admin@labpar.local").lower(),
        admin_clave=_texto("ADMIN_CLAVE"),
        directorio_frontend=Path(frontend).resolve() if frontend else None,
        institucion=_texto("INSTITUCION", "Universidad de Pamplona") or "Universidad de Pamplona",
        contacto_datos=_texto("CONTACTO_DATOS", "") or "",
        trabajadores=max(1, _entero("TRABAJADORES", 2) or 2),
        uid_sandbox=_entero("UID_SANDBOX", None),
        gid_sandbox=_entero("GID_SANDBOX", None),
        directorio_trabajos=Path(_texto("TRABAJOS", str(datos / "trabajos"))).resolve(),
        directorio_cache=Path(_texto("CACHE", str(datos / "cache"))).resolve(),
        max_hilos_ejecucion=max(1, _entero("MAX_HILOS_EJECUCION", max(8, nucleos)) or 8),
        max_envios_simultaneos=max(1, _entero("MAX_ENVIOS_SIMULTANEOS", 3) or 3),
        tiempo_maximo_trabajo_s=max(30, _entero("TIEMPO_MAXIMO_TRABAJO_S", 600) or 600),
    )


config = cargar_config()
