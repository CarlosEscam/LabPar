"""Cursos, inscripciones y asignación de laboratorios."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import obtener_db
from ..deps import curso_accesible, es_personal, requiere_rol, usuario_actual
from ..esquemas import (
    AsignacionIn,
    AsignacionOut,
    AsignacionPatch,
    CursoIn,
    CursoOut,
    CursoPatch,
    EstudianteCursoOut,
    InscripcionIn,
)
from ..modelos import Asignacion, Curso, Envio, Inscripcion, Laboratorio, Usuario
from ..servicios import generar_codigo, lab_resumen, registrar_evento

router = APIRouter(tags=["cursos"])


def _curso_out(db: Session, curso: Curso, usuario: Usuario) -> CursoOut:
    estudiantes = db.scalar(select(func.count()).select_from(Inscripcion).where(Inscripcion.curso_id == curso.id)) or 0
    asignaciones = db.scalar(select(func.count()).select_from(Asignacion).where(Asignacion.curso_id == curso.id)) or 0
    gestiona = usuario.rol == "admin" or curso.docente_id == usuario.id
    return CursoOut(
        id=curso.id,
        nombre=curso.nombre,
        periodo=curso.periodo,
        descripcion=curso.descripcion,
        docente_id=curso.docente_id,
        docente_nombre=curso.docente.nombre if curso.docente else "",
        codigo_inscripcion=curso.codigo_inscripcion if gestiona else None,
        encuesta_sus_activa=curso.encuesta_sus_activa,
        activo=curso.activo,
        num_estudiantes=estudiantes,
        num_asignaciones=asignaciones,
        creado_en=curso.creado_en,
    )


def _codigo_unico(db: Session) -> str:
    for _ in range(50):
        codigo = generar_codigo()
        if not db.scalar(select(Curso.id).where(Curso.codigo_inscripcion == codigo)):
            return codigo
    raise HTTPException(500, "No se pudo generar un código de inscripción único")


@router.get("/cursos", response_model=list[CursoOut])
def listar_cursos(usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> list[CursoOut]:
    consulta = select(Curso).order_by(Curso.creado_en.desc())
    if usuario.rol == "estudiante":
        consulta = consulta.join(Inscripcion).where(Inscripcion.usuario_id == usuario.id, Curso.activo.is_(True))
    elif usuario.rol == "docente":
        consulta = consulta.where(Curso.docente_id == usuario.id)
    return [_curso_out(db, c, usuario) for c in db.scalars(consulta).all()]


@router.post("/cursos", response_model=CursoOut, status_code=status.HTTP_201_CREATED)
def crear_curso(datos: CursoIn, usuario: Usuario = Depends(requiere_rol("docente", "admin")),
                db: Session = Depends(obtener_db)) -> CursoOut:
    curso = Curso(nombre=datos.nombre.strip(), periodo=datos.periodo.strip(), descripcion=datos.descripcion,
                  docente_id=usuario.id, codigo_inscripcion=_codigo_unico(db))
    db.add(curso)
    db.commit()
    db.refresh(curso)
    return _curso_out(db, curso, usuario)


@router.get("/cursos/{curso_id}", response_model=CursoOut)
def obtener_curso(curso_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> CursoOut:
    return _curso_out(db, curso_accesible(db, curso_id, usuario), usuario)


@router.patch("/cursos/{curso_id}", response_model=CursoOut)
def actualizar_curso(curso_id: int, datos: CursoPatch, usuario: Usuario = Depends(usuario_actual),
                     db: Session = Depends(obtener_db)) -> CursoOut:
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(curso, campo, valor)
    db.commit()
    db.refresh(curso)
    return _curso_out(db, curso, usuario)


@router.post("/cursos/{curso_id}/regenerar-codigo", response_model=CursoOut)
def regenerar_codigo(curso_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> CursoOut:
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    curso.codigo_inscripcion = _codigo_unico(db)
    db.commit()
    return _curso_out(db, curso, usuario)


@router.post("/cursos/inscribirse", response_model=CursoOut)
def inscribirse(datos: InscripcionIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> CursoOut:
    curso = db.scalar(select(Curso).where(Curso.codigo_inscripcion == datos.codigo.strip().upper()))
    if curso is None or not curso.activo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El código no corresponde a ningún curso activo")
    existe = db.scalar(select(Inscripcion.id).where(Inscripcion.curso_id == curso.id, Inscripcion.usuario_id == usuario.id))
    if not existe:
        db.add(Inscripcion(curso_id=curso.id, usuario_id=usuario.id))
        registrar_evento(db, usuario.id, "inscripcion", curso_id=curso.id)
        db.commit()
    return _curso_out(db, curso, usuario)


@router.get("/cursos/{curso_id}/estudiantes", response_model=list[EstudianteCursoOut])
def estudiantes(curso_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> list[EstudianteCursoOut]:
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    filas = db.execute(
        select(Usuario, Inscripcion.creado_en)
        .join(Inscripcion, Inscripcion.usuario_id == Usuario.id)
        .where(Inscripcion.curso_id == curso.id)
        .order_by(Usuario.nombre)
    ).all()
    resultado = []
    for est, inscrito_en in filas:
        estad = db.execute(
            select(func.count(Envio.id), func.sum(case((Envio.correcto.is_(True), 1), else_=0)), func.max(Envio.creado_en))
            .where(Envio.usuario_id == est.id, Envio.curso_id == curso.id, Envio.tipo == "evaluacion")
        ).one()
        resultado.append(EstudianteCursoOut(id=est.id, nombre=est.nombre, email=est.email, inscrito_en=inscrito_en,
                                            envios=estad[0] or 0, aceptados=int(estad[1] or 0), ultimo_envio=estad[2]))
    return resultado


@router.delete("/cursos/{curso_id}/estudiantes/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def retirar_estudiante(curso_id: int, usuario_id: int, usuario: Usuario = Depends(usuario_actual),
                       db: Session = Depends(obtener_db)) -> Response:
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    inscripcion = db.scalar(select(Inscripcion).where(Inscripcion.curso_id == curso.id, Inscripcion.usuario_id == usuario_id))
    if inscripcion:
        db.delete(inscripcion)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _estado_estudiante(db: Session, usuario_id: int, asignacion: Asignacion) -> tuple[str, int, float | None]:
    intentos, mejor, aceptado = db.execute(
        select(func.count(Envio.id), func.max(Envio.puntaje), func.max(case((Envio.correcto.is_(True), 1), else_=0)))
        .where(Envio.usuario_id == usuario_id, Envio.laboratorio_id == asignacion.laboratorio_id,
               Envio.tipo == "evaluacion", Envio.curso_id == asignacion.curso_id)
    ).one()
    if aceptado:
        estado = "aceptado"
    elif intentos:
        estado = "en_progreso"
    else:
        estado = "sin_intentos"
    return estado, intentos or 0, mejor


@router.get("/cursos/{curso_id}/asignaciones", response_model=list[AsignacionOut])
def listar_asignaciones(curso_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> list[AsignacionOut]:
    curso = curso_accesible(db, curso_id, usuario)
    asignaciones = db.scalars(
        select(Asignacion).join(Laboratorio).where(Asignacion.curso_id == curso.id).order_by(Laboratorio.orden, Asignacion.id)
    ).all()
    salida = []
    for a in asignaciones:
        if not es_personal(usuario) and not a.laboratorio.publicado:
            continue
        datos = AsignacionOut(id=a.id, curso_id=a.curso_id, laboratorio=lab_resumen(a.laboratorio), fecha_limite=a.fecha_limite,
                              intentos_max=a.intentos_max, creado_en=a.creado_en)
        if usuario.rol == "estudiante":
            datos.estado, datos.intentos, datos.mejor_puntaje = _estado_estudiante(db, usuario.id, a)
        else:
            con_intentos, aceptados = db.execute(
                select(func.count(func.distinct(Envio.usuario_id)),
                       func.count(func.distinct(case((Envio.correcto.is_(True), Envio.usuario_id)))))
                .join(Inscripcion, (Inscripcion.usuario_id == Envio.usuario_id) & (Inscripcion.curso_id == a.curso_id))
                .where(Envio.laboratorio_id == a.laboratorio_id, Envio.curso_id == a.curso_id, Envio.tipo == "evaluacion")
            ).one()
            datos.estudiantes_con_intentos, datos.estudiantes_aceptados = con_intentos or 0, aceptados or 0
        salida.append(datos)
    return salida


@router.post("/cursos/{curso_id}/asignaciones", response_model=AsignacionOut, status_code=status.HTTP_201_CREATED)
def asignar(curso_id: int, datos: AsignacionIn, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> AsignacionOut:
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    lab = db.get(Laboratorio, datos.laboratorio_id)
    if lab is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El laboratorio no existe")
    asignacion = Asignacion(curso_id=curso.id, laboratorio_id=lab.id, fecha_limite=datos.fecha_limite, intentos_max=datos.intentos_max)
    db.add(asignacion)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "El laboratorio ya está asignado a este curso") from None
    db.refresh(asignacion)
    return AsignacionOut(id=asignacion.id, curso_id=curso.id, laboratorio=lab_resumen(lab), fecha_limite=asignacion.fecha_limite,
                         intentos_max=asignacion.intentos_max, creado_en=asignacion.creado_en,
                         estudiantes_con_intentos=0, estudiantes_aceptados=0)


@router.patch("/asignaciones/{asignacion_id}", response_model=AsignacionOut)
def actualizar_asignacion(asignacion_id: int, datos: AsignacionPatch, usuario: Usuario = Depends(usuario_actual),
                          db: Session = Depends(obtener_db)) -> AsignacionOut:
    asignacion = db.get(Asignacion, asignacion_id)
    if asignacion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La asignación no existe")
    curso_accesible(db, asignacion.curso_id, usuario, gestion=True)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(asignacion, campo, valor)
    db.commit()
    db.refresh(asignacion)
    return AsignacionOut(id=asignacion.id, curso_id=asignacion.curso_id, laboratorio=lab_resumen(asignacion.laboratorio),
                         fecha_limite=asignacion.fecha_limite, intentos_max=asignacion.intentos_max, creado_en=asignacion.creado_en)


@router.delete("/asignaciones/{asignacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_asignacion(asignacion_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> Response:
    asignacion = db.get(Asignacion, asignacion_id)
    if asignacion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "La asignación no existe")
    curso_accesible(db, asignacion.curso_id, usuario, gestion=True)
    db.delete(asignacion)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
