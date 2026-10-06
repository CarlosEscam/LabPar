"""Banco de laboratorios: consulta, creación, edición, casos de prueba y salidas de referencia."""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import obtener_db
from ..deps import es_personal, laboratorio_asignado, requiere_rol, usuario_actual
from ..db import ahora
from ..esquemas import BorradorIn, BorradorOut, CasoIn, CasoOut, EnvioOut, LabDocente, LabEstudiante, LabIn, LabResumen
from ..modelos import Asignacion, Borrador, CasoPrueba, Curso, Envio, Inscripcion, Laboratorio, Usuario
from ..servicios import lab_docente, lab_estudiante, lab_resumen

router = APIRouter(tags=["laboratorios"])


def _slug(texto: str) -> str:
    base = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return (base or "laboratorio")[:70]


def _slug_unico(db: Session, deseado: str, excluir_id: int | None = None) -> str:
    candidato, n = deseado, 2
    while True:
        existente = db.scalar(select(Laboratorio.id).where(Laboratorio.slug == candidato))
        if not existente or existente == excluir_id:
            return candidato
        candidato = f"{deseado}-{n}"
        n += 1


def _validar_config(config: dict[str, Any]) -> None:
    for clave in ("requisitos", "prohibidos"):
        for regla in config.get(clave) or []:
            if not isinstance(regla, dict) or "patron" not in regla or "mensaje" not in regla:
                raise HTTPException(422, f"Cada elemento de «{clave}» debe tener «patron» y «mensaje»")
            try:
                re.compile(regla["patron"])
            except re.error as exc:
                raise HTTPException(422, f"Expresión regular inválida en «{clave}»: {exc}") from None
    for clave in ("hilos_correccion", "hilos_rendimiento"):
        valores = config.get(clave)
        if valores is not None and (not isinstance(valores, list) or not all(isinstance(v, int) and 1 <= v <= 256 for v in valores)):
            raise HTTPException(422, f"«{clave}» debe ser una lista de enteros entre 1 y 256")
    if config.get("comparacion") not in (None, "exacta", "tokens", "numerica"):
        raise HTTPException(422, "«comparacion» debe ser exacta, tokens o numerica")


def _obtener(db: Session, laboratorio_id: int) -> Laboratorio:
    lab = db.get(Laboratorio, laboratorio_id)
    if lab is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El laboratorio no existe")
    return lab


def puede_editar(usuario: Usuario, lab: Laboratorio) -> bool:
    """El administrador edita cualquier laboratorio; un docente, solo los que creó. Los del banco se duplican para adaptarlos,
    así un cambio no altera los cursos de otros docentes."""
    return usuario.rol == "admin" or (lab.autor_id is not None and lab.autor_id == usuario.id)


def _editable(db: Session, laboratorio_id: int, usuario: Usuario) -> Laboratorio:
    lab = _obtener(db, laboratorio_id)
    if not puede_editar(usuario, lab):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Solo el autor o un administrador pueden modificar este laboratorio. Duplícalo para adaptarlo a tu curso.")
    return lab


def _vista_docente(lab: Laboratorio, usuario: Usuario) -> dict:
    datos = lab_docente(lab)
    datos["puede_editar"] = puede_editar(usuario, lab)
    return datos


@router.get("/laboratorios", response_model=list[LabResumen])
def listar(modelo: str | None = Query(default=None), usuario: Usuario = Depends(usuario_actual),
           db: Session = Depends(obtener_db)) -> list[dict]:
    consulta = select(Laboratorio).order_by(Laboratorio.orden, Laboratorio.titulo)
    if modelo:
        consulta = consulta.where(Laboratorio.modelo == modelo)
    if not es_personal(usuario):
        # Subconsulta en lugar de DISTINCT: PostgreSQL no puede comparar columnas JSON para eliminar duplicados.
        asignados = (select(Asignacion.laboratorio_id)
                     .join(Curso, Curso.id == Asignacion.curso_id)
                     .join(Inscripcion, Inscripcion.curso_id == Curso.id)
                     .where(Inscripcion.usuario_id == usuario.id, Curso.activo.is_(True)))
        consulta = consulta.where(Laboratorio.id.in_(asignados), Laboratorio.publicado.is_(True))
    return [lab_resumen(l) for l in db.scalars(consulta).all()]


@router.get("/laboratorios/{laboratorio_id}", response_model=LabDocente | LabEstudiante)
def obtener(laboratorio_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> LabDocente | LabEstudiante:
    lab = _obtener(db, laboratorio_id)
    if es_personal(usuario):
        return LabDocente.model_validate(_vista_docente(lab, usuario))
    if not lab.publicado or laboratorio_asignado(db, lab.id, usuario) is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Este laboratorio no está asignado en tus cursos")
    # Se construye el esquema del estudiante explícitamente: nunca incluye soluciones ni casos ocultos.
    return LabEstudiante.model_validate(lab_estudiante(lab))


@router.post("/laboratorios", response_model=LabDocente, status_code=status.HTTP_201_CREATED)
def crear(datos: LabIn, usuario: Usuario = Depends(requiere_rol("docente", "admin")), db: Session = Depends(obtener_db)) -> dict:
    _validar_config(datos.config)
    valores = datos.model_dump()
    valores["slug"] = _slug_unico(db, datos.slug or _slug(datos.titulo))
    lab = Laboratorio(**valores, autor_id=usuario.id, del_banco=False)
    db.add(lab)
    db.commit()
    db.refresh(lab)
    return _vista_docente(lab, usuario)


@router.put("/laboratorios/{laboratorio_id}", response_model=LabDocente)
def actualizar(laboratorio_id: int, datos: LabIn, usuario: Usuario = Depends(requiere_rol("docente", "admin")),
               db: Session = Depends(obtener_db)) -> dict:
    lab = _editable(db, laboratorio_id, usuario)
    _validar_config(datos.config)
    valores = datos.model_dump()
    valores["slug"] = _slug_unico(db, datos.slug or lab.slug, excluir_id=lab.id)
    for campo, valor in valores.items():
        setattr(lab, campo, valor)
    lab.version += 1
    lab.hash_banco = None  # editado: las actualizaciones del banco ya no lo sobrescriben
    db.commit()
    db.refresh(lab)
    return _vista_docente(lab, usuario)


@router.delete("/laboratorios/{laboratorio_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(laboratorio_id: int, usuario: Usuario = Depends(requiere_rol("docente", "admin")), db: Session = Depends(obtener_db)) -> Response:
    lab = _editable(db, laboratorio_id, usuario)
    envios = db.scalar(select(func.count()).select_from(Envio).where(Envio.laboratorio_id == lab.id, Envio.tipo == "evaluacion"))
    if envios:
        raise HTTPException(status.HTTP_409_CONFLICT, "El laboratorio tiene envíos de estudiantes; despublícalo en lugar de eliminarlo")
    db.delete(lab)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/laboratorios/{laboratorio_id}/casos", response_model=CasoOut, status_code=status.HTTP_201_CREATED)
def crear_caso(laboratorio_id: int, datos: CasoIn, usuario: Usuario = Depends(requiere_rol("docente", "admin")),
               db: Session = Depends(obtener_db)) -> CasoPrueba:
    lab = _editable(db, laboratorio_id, usuario)
    orden = datos.orden if datos.orden is not None else (max((c.orden for c in lab.casos), default=-1) + 1)
    caso = CasoPrueba(laboratorio_id=lab.id, nombre=datos.nombre, entrada=datos.entrada, salida_esperada=datos.salida_esperada,
                      visible=datos.visible, peso=datos.peso, orden=orden)
    db.add(caso)
    lab.version += 1
    lab.hash_banco = None
    db.commit()
    db.refresh(caso)
    return caso


@router.put("/casos/{caso_id}", response_model=CasoOut)
def actualizar_caso(caso_id: int, datos: CasoIn, usuario: Usuario = Depends(requiere_rol("docente", "admin")),
                    db: Session = Depends(obtener_db)) -> CasoPrueba:
    caso = db.get(CasoPrueba, caso_id)
    if caso is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El caso no existe")
    _editable(db, caso.laboratorio_id, usuario)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        if valor is not None or campo != "orden":
            setattr(caso, campo, valor)
    caso.laboratorio.version += 1
    caso.laboratorio.hash_banco = None
    db.commit()
    db.refresh(caso)
    return caso


@router.delete("/casos/{caso_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_caso(caso_id: int, usuario: Usuario = Depends(requiere_rol("docente", "admin")), db: Session = Depends(obtener_db)) -> Response:
    caso = db.get(CasoPrueba, caso_id)
    if caso is not None:
        _editable(db, caso.laboratorio_id, usuario)
        caso.laboratorio.version += 1
        caso.laboratorio.hash_banco = None
        db.delete(caso)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/laboratorios/{laboratorio_id}/generar-salidas", response_model=EnvioOut, status_code=status.HTTP_202_ACCEPTED)
def generar_salidas(laboratorio_id: int, usuario: Usuario = Depends(requiere_rol("docente", "admin")),
                    db: Session = Depends(obtener_db)) -> Envio:
    """Encola la ejecución de la solución de referencia para (re)calcular las salidas esperadas."""
    lab = _editable(db, laboratorio_id, usuario)
    if not lab.solucion_referencia.strip():
        raise HTTPException(422, "El laboratorio no tiene solución de referencia")
    envio = Envio(usuario_id=usuario.id, laboratorio_id=lab.id, tipo="referencia", codigo=lab.solucion_referencia,
                  parametros={"actualizar_casos": True, "version_lab": lab.version}, prioridad=7)
    db.add(envio)
    db.commit()
    db.refresh(envio)
    return envio


@router.get("/laboratorios/{laboratorio_id}/exportar")
def exportar(laboratorio_id: int, usuario: Usuario = Depends(requiere_rol("docente", "admin")), db: Session = Depends(obtener_db)) -> dict:
    lab = _obtener(db, laboratorio_id)
    datos = lab_docente(lab)
    for clave in ("id", "autor_id", "actualizado_en", "evaluacion", "casos_visibles", "del_banco", "version"):
        datos.pop(clave, None)
    for caso in datos["casos"]:
        caso.pop("id", None)
    return {"formato": "labpar-laboratorio", "version_formato": 1, "laboratorio": datos}


@router.post("/laboratorios/importar", response_model=LabDocente, status_code=status.HTTP_201_CREATED)
def importar(paquete: dict, usuario: Usuario = Depends(requiere_rol("docente", "admin")), db: Session = Depends(obtener_db)) -> dict:
    if paquete.get("formato") != "labpar-laboratorio" or "laboratorio" not in paquete:
        raise HTTPException(422, "El archivo no es un laboratorio exportado desde LabPar")
    datos = dict(paquete["laboratorio"])
    casos = datos.pop("casos", [])
    lab_in = LabIn.model_validate(datos)
    _validar_config(lab_in.config)
    valores = lab_in.model_dump()
    valores["slug"] = _slug_unico(db, lab_in.slug or _slug(lab_in.titulo))
    lab = Laboratorio(**valores, autor_id=usuario.id, del_banco=False)
    db.add(lab)
    db.flush()
    for i, caso in enumerate(casos):
        c = CasoIn.model_validate(caso)
        db.add(CasoPrueba(laboratorio_id=lab.id, nombre=c.nombre, entrada=c.entrada, salida_esperada=c.salida_esperada,
                          visible=c.visible, peso=c.peso, orden=c.orden if c.orden is not None else i))
    db.commit()
    db.refresh(lab)
    return _vista_docente(lab, usuario)


@router.post("/laboratorios/{laboratorio_id}/duplicar", response_model=LabDocente, status_code=status.HTTP_201_CREATED)
def duplicar(laboratorio_id: int, usuario: Usuario = Depends(requiere_rol("docente", "admin")), db: Session = Depends(obtener_db)) -> dict:
    """Crea una copia editable (con sus casos) cuyo autor es quien la solicita."""
    original = _obtener(db, laboratorio_id)
    campos = ("modelo", "lenguaje", "nivel", "orden", "resumen", "enunciado_md", "plantilla", "solucion_referencia",
              "solucion_docente", "config", "objetivos", "conceptos", "preguntas", "pistas", "duracion_estimada_min", "publicado")
    titulo = f"{original.titulo} (copia)"[:200]
    copia = Laboratorio(**{c: getattr(original, c) for c in campos}, titulo=titulo, slug=_slug_unico(db, _slug(titulo)),
                        autor_id=usuario.id, del_banco=False)
    db.add(copia)
    db.flush()
    for c in original.casos:
        db.add(CasoPrueba(laboratorio_id=copia.id, nombre=c.nombre, entrada=c.entrada, salida_esperada=c.salida_esperada,
                          visible=c.visible, peso=c.peso, orden=c.orden))
    db.commit()
    db.refresh(copia)
    return _vista_docente(copia, usuario)


# ----------------------------------------------------------------------------- Borradores (autoguardado del editor)
def _lab_para_borrador(db: Session, laboratorio_id: int, usuario: Usuario) -> Laboratorio:
    lab = _obtener(db, laboratorio_id)
    if not es_personal(usuario) and (not lab.publicado or laboratorio_asignado(db, lab.id, usuario) is None):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Este laboratorio no está asignado en tus cursos")
    return lab


@router.get("/laboratorios/{laboratorio_id}/borrador", response_model=BorradorOut)
def leer_borrador(laboratorio_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> BorradorOut:
    lab = _lab_para_borrador(db, laboratorio_id, usuario)
    b = db.scalar(select(Borrador).where(Borrador.usuario_id == usuario.id, Borrador.laboratorio_id == lab.id))
    return BorradorOut(codigo=b.codigo if b else None, actualizado_en=b.actualizado_en if b else None)


@router.put("/laboratorios/{laboratorio_id}/borrador", response_model=BorradorOut)
def guardar_borrador(laboratorio_id: int, datos: BorradorIn, usuario: Usuario = Depends(usuario_actual),
                     db: Session = Depends(obtener_db)) -> BorradorOut:
    lab = _lab_para_borrador(db, laboratorio_id, usuario)
    b = db.scalar(select(Borrador).where(Borrador.usuario_id == usuario.id, Borrador.laboratorio_id == lab.id))
    if b is None:
        b = Borrador(usuario_id=usuario.id, laboratorio_id=lab.id, codigo=datos.codigo)
        db.add(b)
    else:
        b.codigo = datos.codigo
        b.actualizado_en = ahora()
    db.commit()
    return BorradorOut(codigo=None, actualizado_en=b.actualizado_en)


@router.delete("/laboratorios/{laboratorio_id}/borrador", status_code=status.HTTP_204_NO_CONTENT)
def borrar_borrador(laboratorio_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> Response:
    lab = _lab_para_borrador(db, laboratorio_id, usuario)
    b = db.scalar(select(Borrador).where(Borrador.usuario_id == usuario.id, Borrador.laboratorio_id == lab.id))
    if b is not None:
        db.delete(b)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
