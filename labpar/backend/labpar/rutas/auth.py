"""Registro, inicio de sesión y perfil."""
from __future__ import annotations

import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import __version__
from ..config import config
from ..db import ahora, obtener_db
from ..deps import usuario_actual
from ..esquemas import ConfigPublicaOut, IngresoIn, PerfilIn, RegistroIn, TokenOut, UsuarioOut
from ..modelos import Curso, Inscripcion, Usuario
from ..seguridad import crear_token, hash_clave, verificar_clave
from ..semilla import CLAVE_ADMIN_DEMO, CUENTAS_DEMO
from ..servicios import registrar_evento

router = APIRouter(prefix="/auth", tags=["autenticación"])

# Limitador sencillo de intentos fallidos (por correo y por IP) para frenar ataques de fuerza bruta.
_INTENTOS: dict[str, list[float]] = {}
_CANDADO = threading.Lock()
_VENTANA_S = 600
_MAXIMO = 8


def _bloqueado(clave: str) -> bool:
    with _CANDADO:
        recientes = [t for t in _INTENTOS.get(clave, []) if time.time() - t < _VENTANA_S]
        _INTENTOS[clave] = recientes
        return len(recientes) >= _MAXIMO


def _fallo(clave: str) -> None:
    with _CANDADO:
        _INTENTOS.setdefault(clave, []).append(time.time())


def _token(usuario: Usuario) -> TokenOut:
    return TokenOut(token=crear_token(usuario.id, usuario.rol), usuario=UsuarioOut.model_validate(usuario))


@router.get("/config-publica", response_model=ConfigPublicaOut)
def config_publica() -> ConfigPublicaOut:
    cuentas = []
    if config.modo_demo:
        cuentas = [{"rol": rol.capitalize(), "email": email, "clave": clave} for email, _, rol, clave in CUENTAS_DEMO]
        if not config.admin_clave:
            cuentas.append({"rol": "Administrador", "email": config.admin_email, "clave": CLAVE_ADMIN_DEMO})
    return ConfigPublicaOut(registro_abierto=config.registro_abierto, demo=config.modo_demo, cuentas_demo=cuentas,
                            version=__version__, institucion=config.institucion, contacto_datos=config.contacto_datos)


@router.post("/registro", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def registro(datos: RegistroIn, db: Session = Depends(obtener_db)) -> TokenOut:
    if not config.registro_abierto:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "El registro de estudiantes está cerrado; solicita una cuenta al docente")
    if not datos.acepta_terminos:
        raise HTTPException(422, "Debes aceptar los términos de uso y el tratamiento de datos")
    email = datos.email.lower()
    if db.scalar(select(func.count()).select_from(Usuario).where(Usuario.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo")
    curso = None
    if datos.codigo_inscripcion:
        curso = db.scalar(select(Curso).where(Curso.codigo_inscripcion == datos.codigo_inscripcion.strip().upper()))
        if curso is None or not curso.activo:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "El código de inscripción no corresponde a ningún curso activo")
    usuario = Usuario(
        nombre=datos.nombre,
        email=email,
        hash_clave=hash_clave(datos.clave),
        rol="estudiante",
        consentimiento_investigacion=datos.consentimiento_investigacion,
        consentimiento_fecha=ahora() if datos.consentimiento_investigacion else None,
        ultimo_ingreso=ahora(),
    )
    db.add(usuario)
    db.flush()
    if curso is not None:
        db.add(Inscripcion(curso_id=curso.id, usuario_id=usuario.id))
    registrar_evento(db, usuario.id, "registro", curso_id=curso.id if curso else None)
    db.commit()
    db.refresh(usuario)
    return _token(usuario)


@router.post("/ingresar", response_model=TokenOut)
def ingresar(datos: IngresoIn, request: Request, db: Session = Depends(obtener_db)) -> TokenOut:
    email = datos.email.lower()
    ip = request.client.host if request.client else "?"
    for clave in (f"email:{email}", f"ip:{ip}"):
        if _bloqueado(clave):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos fallidos; espera unos minutos")
    usuario = db.scalar(select(Usuario).where(Usuario.email == email))
    if usuario is None or not verificar_clave(datos.clave, usuario.hash_clave):
        _fallo(f"email:{email}")
        _fallo(f"ip:{ip}")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos")
    if not usuario.activo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "La cuenta está desactivada")
    usuario.ultimo_ingreso = ahora()
    registrar_evento(db, usuario.id, "ingreso")
    db.commit()
    return _token(usuario)


@router.get("/yo", response_model=UsuarioOut)
def yo(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
    return usuario


@router.patch("/yo", response_model=UsuarioOut)
def actualizar_perfil(datos: PerfilIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> Usuario:
    if datos.nombre is not None:
        usuario.nombre = " ".join(datos.nombre.split())
    if datos.consentimiento_investigacion is not None and datos.consentimiento_investigacion != usuario.consentimiento_investigacion:
        usuario.consentimiento_investigacion = datos.consentimiento_investigacion
        usuario.consentimiento_fecha = ahora()
        registrar_evento(db, usuario.id, "consentimiento", datos={"otorgado": datos.consentimiento_investigacion})
    if datos.clave_nueva:
        if not datos.clave_actual or not verificar_clave(datos.clave_actual, usuario.hash_clave):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no es correcta")
        usuario.hash_clave = hash_clave(datos.clave_nueva)
    db.commit()
    db.refresh(usuario)
    return usuario
