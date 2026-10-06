"""Eventos de uso, encuesta SUS, administración y estado del sistema."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import __version__
from ..config import config
from ..db import ahora, obtener_db
from ..deps import curso_accesible, requiere_rol, usuario_actual
from ..esquemas import EventoIn, SUSEstadoOut, SUSIn, UsuarioAdminIn, UsuarioAdminPatch, UsuarioOut
from ..estadistica import puntaje_sus
from ..modelos import Envio, RespuestaSUS, Trabajador, Usuario
from ..seguridad import hash_clave
from ..servicios import registrar_evento

router = APIRouter()


# ----------------------------------------------------------------------------- Eventos
@router.post("/eventos", status_code=status.HTTP_204_NO_CONTENT, tags=["eventos"])
def registrar(datos: EventoIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> None:
    if datos.curso_id is not None:
        curso_accesible(db, datos.curso_id, usuario)
    registrar_evento(db, usuario.id, datos.tipo, laboratorio_id=datos.laboratorio_id, curso_id=datos.curso_id, datos=datos.datos)
    db.commit()


# ----------------------------------------------------------------------------- Encuesta SUS
@router.get("/sus/{curso_id}", response_model=SUSEstadoOut, tags=["encuesta SUS"])
def estado_sus(curso_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> SUSEstadoOut:
    curso = curso_accesible(db, curso_id, usuario)
    respuesta = db.scalar(select(RespuestaSUS).where(RespuestaSUS.curso_id == curso.id, RespuestaSUS.usuario_id == usuario.id))
    return SUSEstadoOut(activa=curso.encuesta_sus_activa, respondida=respuesta is not None,
                        puntaje=respuesta.puntaje if respuesta else None)


@router.post("/sus/{curso_id}", response_model=SUSEstadoOut, status_code=status.HTTP_201_CREATED, tags=["encuesta SUS"])
def responder_sus(curso_id: int, datos: SUSIn, usuario: Usuario = Depends(requiere_rol("estudiante")),
                  db: Session = Depends(obtener_db)) -> SUSEstadoOut:
    curso = curso_accesible(db, curso_id, usuario)
    if not curso.encuesta_sus_activa:
        raise HTTPException(status.HTTP_409_CONFLICT, "La encuesta no está activa en este curso")
    puntaje = puntaje_sus(datos.respuestas)
    db.add(RespuestaSUS(usuario_id=usuario.id, curso_id=curso.id, respuestas=datos.respuestas, puntaje=puntaje))
    registrar_evento(db, usuario.id, "sus_respondida", curso_id=curso.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya respondiste la encuesta de este curso") from None
    return SUSEstadoOut(activa=True, respondida=True, puntaje=puntaje)


# ----------------------------------------------------------------------------- Administración
@router.get("/admin/estado", tags=["administración"])
def estado_sistema(usuario: Usuario = Depends(requiere_rol("docente", "admin")), db: Session = Depends(obtener_db)) -> dict:
    momento = ahora()
    trabajadores = []
    for t in db.scalars(select(Trabajador).order_by(Trabajador.id)).all():
        edad = (momento - t.ultimo_latido).total_seconds()
        # Un trabajador ocupado no late mientras evalúa: se tolera hasta el tiempo máximo de un trabajo.
        tolerancia = config.tiempo_maximo_trabajo_s + 30 if t.estado == "ocupado" else 30
        estado = t.estado if (edad < tolerancia or t.estado == "detenido") else "sin_respuesta"
        trabajadores.append({
            "id": t.id, "host": t.host, "pid": t.pid, "estado": estado,
            "envio_actual": t.envio_actual, "procesados": t.procesados, "fallidos": t.fallidos,
            "capacidades": t.capacidades, "segundos_desde_latido": round(edad, 1), "iniciado_en": t.iniciado_en,
        })
    activos = [t for t in trabajadores if t["estado"] in ("libre", "ocupado")]
    capacidades = {m: any((t["capacidades"].get(m) or {}).get("disponible") for t in activos) for m in ("openmp", "mpi", "cuda")}
    hace_un_dia = momento - timedelta(days=1)
    conteos = dict(db.execute(select(Envio.estado, func.count()).group_by(Envio.estado)).all())
    recientes = db.scalars(select(Envio).where(Envio.finalizado_en.is_not(None), Envio.creado_en >= hace_un_dia)).all()
    esperas = [(e.iniciado_en - e.creado_en).total_seconds() for e in recientes if e.iniciado_en]
    procesos = [(e.finalizado_en - e.iniciado_en).total_seconds() for e in recientes if e.iniciado_en and e.finalizado_en]
    return {
        "version": __version__,
        "trabajadores": trabajadores,
        "capacidades": capacidades,
        # Varios procesos trabajadores pueden compartir un nodo: los núcleos se cuentan una vez por host.
        "nucleos_totales": sum({t["host"]: (t["capacidades"].get("nucleos") or 0) for t in activos}.values()),
        "nodos": len({t["host"] for t in activos}),
        "cola": {
            "pendientes": conteos.get("pendiente", 0),
            "ejecutando": conteos.get("ejecutando", 0),
            "completados_24h": len(recientes),
            "errores_24h": sum(1 for e in recientes if e.estado == "error"),
            "espera_media_s": round(sum(esperas) / len(esperas), 2) if esperas else None,
            "proceso_medio_s": round(sum(procesos) / len(procesos), 2) if procesos else None,
        },
    }


@router.get("/admin/usuarios", response_model=list[UsuarioOut], tags=["administración"])
def listar_usuarios(rol: str | None = None, q: str | None = Query(default=None, max_length=100),
                    usuario: Usuario = Depends(requiere_rol("admin")), db: Session = Depends(obtener_db)) -> list[Usuario]:
    consulta = select(Usuario).order_by(Usuario.rol, Usuario.nombre)
    if rol:
        consulta = consulta.where(Usuario.rol == rol)
    if q:
        patron = f"%{q.lower()}%"
        consulta = consulta.where(func.lower(Usuario.nombre).like(patron) | func.lower(Usuario.email).like(patron))
    return list(db.scalars(consulta.limit(500)).all())


@router.post("/admin/usuarios", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED, tags=["administración"])
def crear_usuario(datos: UsuarioAdminIn, usuario: Usuario = Depends(requiere_rol("admin")), db: Session = Depends(obtener_db)) -> Usuario:
    email = datos.email.lower()
    if db.scalar(select(Usuario.id).where(Usuario.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese correo")
    nuevo = Usuario(nombre=datos.nombre, email=email, hash_clave=hash_clave(datos.clave), rol=datos.rol)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.patch("/admin/usuarios/{usuario_id}", response_model=UsuarioOut, tags=["administración"])
def actualizar_usuario(usuario_id: int, datos: UsuarioAdminPatch, usuario: Usuario = Depends(requiere_rol("admin")),
                       db: Session = Depends(obtener_db)) -> Usuario:
    objetivo = db.get(Usuario, usuario_id)
    if objetivo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El usuario no existe")
    if objetivo.id == usuario.id and (datos.rol not in (None, "admin") or datos.activo is False):
        raise HTTPException(status.HTTP_409_CONFLICT, "No puedes quitarte el rol de administrador ni desactivarte")
    if datos.rol is not None:
        objetivo.rol = datos.rol
    if datos.activo is not None:
        objetivo.activo = datos.activo
    if datos.clave:
        objetivo.hash_clave = hash_clave(datos.clave)
    db.commit()
    db.refresh(objetivo)
    return objetivo


@router.post("/admin/envios/{envio_id}/reintentar", status_code=status.HTTP_202_ACCEPTED, tags=["administración"])
def reintentar(envio_id: int, usuario: Usuario = Depends(requiere_rol("admin")), db: Session = Depends(obtener_db)) -> dict:
    envio = db.get(Envio, envio_id)
    if envio is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El envío no existe")
    envio.estado, envio.trabajador, envio.iniciado_en, envio.finalizado_en = "pendiente", None, None, None
    envio.intentos_proceso = 0
    db.commit()
    return {"id": envio.id, "estado": envio.estado}


# ----------------------------------------------------------------------------- Salud
@router.get("/salud", tags=["sistema"])
def salud(db: Session = Depends(obtener_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"estado": "ok", "version": __version__}
