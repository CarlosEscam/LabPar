"""Dependencias comunes: sesión de base de datos, usuario autenticado y control de acceso."""
from __future__ import annotations

from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import obtener_db
from .modelos import Asignacion, Curso, Inscripcion, Usuario
from .seguridad import decodificar_token

_bearer = HTTPBearer(auto_error=False)


def usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(obtener_db)
) -> Usuario:
    if credenciales is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Debes iniciar sesión", headers={"WWW-Authenticate": "Bearer"})
    try:
        carga = decodificar_token(credenciales.credentials)
        usuario = db.get(Usuario, int(carga["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        usuario = None
    if usuario is None or not usuario.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La sesión no es válida o expiró", headers={"WWW-Authenticate": "Bearer"})
    return usuario


def requiere_rol(*roles: str) -> Callable[[Usuario], Usuario]:
    def _verificar(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción")
        return usuario

    return _verificar


def es_personal(usuario: Usuario) -> bool:
    return usuario.rol in ("docente", "admin")


def curso_accesible(db: Session, curso_id: int, usuario: Usuario, gestion: bool = False) -> Curso:
    """Devuelve el curso si el usuario puede verlo (o gestionarlo, si gestion=True)."""
    curso = db.get(Curso, curso_id)
    if curso is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El curso no existe")
    if usuario.rol == "admin" or curso.docente_id == usuario.id:
        return curso
    if gestion:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el docente del curso puede gestionarlo")
    if usuario.rol == "docente":
        return curso  # los docentes pueden consultar cursos de colegas
    inscrito = db.scalar(select(Inscripcion.id).where(Inscripcion.curso_id == curso_id, Inscripcion.usuario_id == usuario.id))
    if not inscrito or not curso.activo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No estás inscrito en este curso")
    return curso


def laboratorio_asignado(db: Session, laboratorio_id: int, usuario: Usuario, curso_id: int | None = None) -> Asignacion | None:
    """Para estudiantes: la asignación del laboratorio en alguno de sus cursos (o en el curso indicado)."""
    consulta = (
        select(Asignacion)
        .join(Curso, Curso.id == Asignacion.curso_id)
        .join(Inscripcion, Inscripcion.curso_id == Curso.id)
        .where(Asignacion.laboratorio_id == laboratorio_id, Inscripcion.usuario_id == usuario.id, Curso.activo.is_(True))
    )
    if curso_id is not None:
        consulta = consulta.where(Asignacion.curso_id == curso_id)
    return db.scalars(consulta.order_by(Asignacion.id)).first()
