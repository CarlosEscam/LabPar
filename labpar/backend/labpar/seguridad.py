"""Contraseñas, tokens JWT y seudónimos para la exportación de datos de investigación."""
from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import config

ALGORITMO = "HS256"


def _prehash(clave: str) -> bytes:
    # bcrypt solo usa 72 bytes: se aplica SHA-256 antes para admitir contraseñas largas sin truncarlas.
    return base64.b64encode(hashlib.sha256(clave.encode("utf-8")).digest())


def hash_clave(clave: str) -> str:
    return bcrypt.hashpw(_prehash(clave), bcrypt.gensalt(rounds=12)).decode("ascii")


def verificar_clave(clave: str, hash_guardado: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(clave), hash_guardado.encode("ascii"))
    except ValueError:
        return False


def crear_token(usuario_id: int, rol: str) -> str:
    ahora = datetime.now(timezone.utc)
    carga = {"sub": str(usuario_id), "rol": rol, "iat": ahora, "exp": ahora + timedelta(hours=config.jwt_horas)}
    return jwt.encode(carga, config.jwt_secreto, algorithm=ALGORITMO)


def decodificar_token(token: str) -> dict:
    return jwt.decode(token, config.jwt_secreto, algorithms=[ALGORITMO])


def seudonimo(usuario_id: int) -> str:
    """Identificador estable y no reversible para exportaciones anonimizadas (Ley 1581 de 2012)."""
    firma = hmac.new(config.seudonimo_secreto.encode("utf-8"), f"usuario:{usuario_id}".encode(), hashlib.sha256)
    return "E-" + firma.hexdigest()[:10].upper()
