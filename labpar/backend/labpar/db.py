"""Conexión a la base de datos (PostgreSQL en producción, SQLite en desarrollo)."""
from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from .config import config


def ahora() -> datetime:
    return datetime.now(timezone.utc)


class FechaHoraUTC(TypeDecorator):
    """Guarda siempre en UTC y devuelve fechas con zona horaria (también en SQLite)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Base(DeclarativeBase):
    pass


def crear_motor(url: str | None = None) -> Engine:
    url = url or config.database_url
    if url.startswith("sqlite"):
        motor = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(motor, "connect")
        def _pragmas(conexion, _registro):  # pragma: no cover - configuración de SQLite
            cursor = conexion.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

        return motor
    return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=20)


motor = crear_motor()
SesionLocal = sessionmaker(bind=motor, autoflush=False, expire_on_commit=False)


def obtener_db() -> Iterator[Session]:
    sesion = SesionLocal()
    try:
        yield sesion
    finally:
        sesion.close()


def crear_tablas() -> None:
    import importlib

    importlib.import_module(f"{__package__}.modelos")  # registra los modelos en Base.metadata
    Base.metadata.create_all(motor)
