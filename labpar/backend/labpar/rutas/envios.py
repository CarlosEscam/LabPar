"""Envíos de código: ejecución rápida y evaluación completa (procesados por los trabajadores)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import config
from ..db import ahora, obtener_db
from ..deps import curso_accesible, es_personal, laboratorio_asignado, usuario_actual
from ..esquemas import EnvioIn, EnvioOut, EnvioResumen
from ..modelos import Curso, Envio, Laboratorio, Usuario
from ..servicios import filtrar_resultado, registrar_evento

router = APIRouter(tags=["envíos"])

PRIORIDADES = {"ejecucion": 10, "referencia": 7, "evaluacion": 5}


def _posicion_cola(db: Session, envio: Envio) -> int | None:
    if envio.estado != "pendiente":
        return None
    delante = db.scalar(
        select(func.count()).select_from(Envio).where(
            Envio.estado == "pendiente",
            or_(Envio.prioridad > envio.prioridad, (Envio.prioridad == envio.prioridad) & (Envio.id < envio.id)),
        )
    )
    return int(delante or 0) + 1


def _envio_out(db: Session, envio: Envio, usuario: Usuario) -> EnvioOut:
    datos = EnvioOut.model_validate(envio)
    datos.resultado = filtrar_resultado(envio.resultado, es_personal(usuario))
    datos.posicion_cola = _posicion_cola(db, envio)
    datos.usuario_nombre = envio.usuario.nombre if envio.usuario else None
    datos.laboratorio_titulo = envio.laboratorio.titulo if envio.laboratorio else None
    return datos


def _verificar_acceso_envio(db: Session, envio: Envio, usuario: Usuario) -> None:
    """El autor siempre ve su envío y el administrador, cualquiera. Un docente ve los envíos de los cursos que dirige y
    las ejecuciones de referencia (no contienen datos de estudiantes): el código de un estudiante es un dato personal."""
    if envio.usuario_id == usuario.id or usuario.rol == "admin":
        return
    if usuario.rol == "docente":
        if envio.tipo == "referencia":
            return
        if envio.curso_id is not None:
            curso = db.get(Curso, envio.curso_id)
            if curso is not None and curso.docente_id == usuario.id:
                return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes acceso a este envío")


@router.post("/envios", response_model=EnvioOut, status_code=status.HTTP_202_ACCEPTED)
def crear_envio(datos: EnvioIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> EnvioOut:
    lab = db.get(Laboratorio, datos.laboratorio_id)
    if lab is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El laboratorio no existe")
    curso_id = datos.curso_id
    parametros: dict = {}
    if usuario.rol == "estudiante":
        asignacion = laboratorio_asignado(db, lab.id, usuario, curso_id)
        if asignacion is None or not lab.publicado:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Este laboratorio no está asignado en tus cursos")
        curso_id = asignacion.curso_id
        if datos.tipo == "evaluacion":
            if asignacion.intentos_max is not None:
                usados = db.scalar(select(func.count()).select_from(Envio).where(
                    Envio.usuario_id == usuario.id, Envio.laboratorio_id == lab.id, Envio.curso_id == curso_id,
                    Envio.tipo == "evaluacion"))
                if (usados or 0) >= asignacion.intentos_max:
                    raise HTTPException(status.HTTP_409_CONFLICT, f"Ya usaste los {asignacion.intentos_max} intentos permitidos")
            if asignacion.fecha_limite is not None and ahora() > asignacion.fecha_limite:
                parametros["tardio"] = True
    elif curso_id is not None:
        curso_accesible(db, curso_id, usuario)

    activos = db.scalar(select(func.count()).select_from(Envio).where(
        Envio.usuario_id == usuario.id, Envio.estado.in_(("pendiente", "ejecutando"))))
    if (activos or 0) >= config.max_envios_simultaneos:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Tienes envíos en proceso; espera a que terminen antes de enviar otro")

    if datos.tipo == "ejecucion":
        parametros["hilos"] = max(1, min(datos.hilos or 1, config.max_hilos_ejecucion))
        if datos.entrada is not None:
            parametros["entrada"] = datos.entrada
    envio = Envio(usuario_id=usuario.id, laboratorio_id=lab.id, curso_id=curso_id, tipo=datos.tipo, codigo=datos.codigo,
                  parametros=parametros, prioridad=PRIORIDADES[datos.tipo], estado="pendiente")
    db.add(envio)
    db.flush()
    registrar_evento(db, usuario.id, "envio_" + datos.tipo, laboratorio_id=lab.id, curso_id=curso_id, datos={"envio_id": envio.id})
    db.commit()
    db.refresh(envio)
    return _envio_out(db, envio, usuario)


@router.get("/envios", response_model=list[EnvioResumen])
def listar_envios(
    laboratorio_id: int | None = None,
    curso_id: int | None = None,
    usuario_id: int | None = None,
    tipo: str | None = Query(default="evaluacion"),
    limite: int = Query(default=50, ge=1, le=500),
    usuario: Usuario = Depends(usuario_actual),
    db: Session = Depends(obtener_db),
) -> list[Envio]:
    consulta = select(Envio).order_by(Envio.id.desc()).limit(limite)
    if usuario.rol == "estudiante":
        consulta = consulta.where(Envio.usuario_id == usuario.id)
    else:
        if curso_id is not None:
            curso_accesible(db, curso_id, usuario, gestion=True)
        if usuario_id is not None:
            consulta = consulta.where(Envio.usuario_id == usuario_id)
            if usuario.rol == "docente" and usuario_id != usuario.id and curso_id is None:
                # Solo los envíos hechos en cursos que dirige
                consulta = consulta.where(Envio.curso_id.in_(select(Curso.id).where(Curso.docente_id == usuario.id)))
        elif curso_id is None and usuario.rol == "docente":
            consulta = consulta.where(Envio.usuario_id == usuario.id)
    if laboratorio_id is not None:
        consulta = consulta.where(Envio.laboratorio_id == laboratorio_id)
    if curso_id is not None:
        consulta = consulta.where(Envio.curso_id == curso_id)
    if tipo and tipo != "todos":
        consulta = consulta.where(Envio.tipo == tipo)
    return list(db.scalars(consulta).all())


@router.get("/envios/{envio_id}", response_model=EnvioOut)
def obtener_envio(envio_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> EnvioOut:
    envio = db.get(Envio, envio_id)
    if envio is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El envío no existe")
    _verificar_acceso_envio(db, envio, usuario)
    return _envio_out(db, envio, usuario)


@router.get("/envios/{envio_id}/codigo")
def codigo_envio(envio_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> dict:
    envio = db.get(Envio, envio_id)
    if envio is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El envío no existe")
    _verificar_acceso_envio(db, envio, usuario)
    return {"id": envio.id, "codigo": envio.codigo}
