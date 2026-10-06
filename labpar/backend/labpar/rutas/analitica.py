"""Analítica de aprendizaje para el docente y exportación anonimizada para la investigación (fase 4)."""
from __future__ import annotations

import csv
import io
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import obtener_db
from ..deps import curso_accesible, usuario_actual
from ..estadistica import prueba_t_una_muestra, resumen
from ..modelos import Asignacion, Envio, Evento, Inscripcion, Laboratorio, RespuestaSUS, Usuario
from ..motor.retro import CATALOGO
from ..seguridad import seudonimo
from ..servicios import lab_resumen

router = APIRouter(tags=["analítica"])

MU0_SUS = 70.0  # Hipótesis H2 del proyecto: SUS medio > 70


def _datos_curso(db: Session, curso_id: int):
    estudiantes = db.scalars(
        select(Usuario).join(Inscripcion, Inscripcion.usuario_id == Usuario.id)
        .where(Inscripcion.curso_id == curso_id, Usuario.rol == "estudiante").order_by(Usuario.nombre)
    ).all()
    asignaciones = db.scalars(
        select(Asignacion).join(Laboratorio).where(Asignacion.curso_id == curso_id).order_by(Laboratorio.orden)
    ).all()
    ids_est = {e.id for e in estudiantes}
    envios = [e for e in db.scalars(
        select(Envio).where(Envio.curso_id == curso_id, Envio.tipo.in_(("evaluacion", "ejecucion"))).order_by(Envio.creado_en)
    ).all() if e.usuario_id in ids_est]
    eventos = [e for e in db.scalars(
        select(Evento).where(Evento.tipo == "lab_abierto", Evento.curso_id == curso_id).order_by(Evento.creado_en)
    ).all() if e.usuario_id in ids_est]
    return estudiantes, asignaciones, envios, eventos


def _celdas_progreso(estudiantes, asignaciones, envios, eventos) -> list[dict]:
    aperturas: dict[tuple[int, int], datetime] = {}
    for ev in eventos:
        aperturas.setdefault((ev.usuario_id, ev.laboratorio_id), ev.creado_en)
    por_par: dict[tuple[int, int], list[Envio]] = defaultdict(list)
    for e in envios:
        if e.tipo == "evaluacion":
            por_par[(e.usuario_id, e.laboratorio_id)].append(e)
    celdas = []
    for est in estudiantes:
        for asig in asignaciones:
            lista = por_par.get((est.id, asig.laboratorio_id), [])
            terminados = [e for e in lista if e.estado == "completado"]
            puntajes = [e.puntaje for e in terminados if e.puntaje is not None]
            primer_ok = next((i for i, e in enumerate(lista) if e.correcto), None)
            minutos = None
            if primer_ok is not None:
                inicio = aperturas.get((est.id, asig.laboratorio_id)) or lista[0].creado_en
                minutos = round(max(0.0, (lista[primer_ok].creado_en - inicio).total_seconds() / 60.0), 1)
            celdas.append({
                "usuario_id": est.id,
                "laboratorio_id": asig.laboratorio_id,
                "intentos": len(lista),
                "mejor_puntaje": max(puntajes) if puntajes else None,
                "aceptado": primer_ok is not None,
                "envios_hasta_aceptado": (primer_ok + 1) if primer_ok is not None else None,
                "minutos_hasta_aceptado": minutos,
                "mejor_aceleracion": max((e.aceleracion for e in terminados if e.aceleracion is not None), default=None),
                "primera_apertura": aperturas.get((est.id, asig.laboratorio_id)),
            })
    return celdas


@router.get("/cursos/{curso_id}/progreso")
def progreso(curso_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> dict:
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    estudiantes, asignaciones, envios, eventos = _datos_curso(db, curso.id)
    return {
        "estudiantes": [{"id": e.id, "nombre": e.nombre, "email": e.email} for e in estudiantes],
        "laboratorios": [lab_resumen(a.laboratorio) for a in asignaciones],
        "celdas": _celdas_progreso(estudiantes, asignaciones, envios, eventos),
    }


@router.get("/cursos/{curso_id}/analitica")
def analitica(curso_id: int, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> dict:
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    estudiantes, asignaciones, envios, eventos = _datos_curso(db, curso.id)
    celdas = _celdas_progreso(estudiantes, asignaciones, envios, eventos)
    evaluaciones = [e for e in envios if e.tipo == "evaluacion"]

    hoy = datetime.now(timezone.utc).date()
    dias = {hoy - timedelta(days=i): {"evaluaciones": 0, "ejecuciones": 0} for i in range(29, -1, -1)}
    for e in envios:
        d = e.creado_en.astimezone(timezone.utc).date()
        if d in dias:
            dias[d]["evaluaciones" if e.tipo == "evaluacion" else "ejecuciones"] += 1

    veredictos = Counter(e.veredicto or e.estado for e in evaluaciones)
    codigos: Counter[str] = Counter()
    estudiantes_por_codigo: dict[str, set[int]] = defaultdict(set)
    for e in evaluaciones:
        vistos = set()
        for r in (e.resultado or {}).get("retroalimentacion", []):
            codigo = r.get("codigo")
            if r.get("nivel") in ("error", "advertencia", "sugerencia") and codigo and codigo not in vistos:
                vistos.add(codigo)
                codigos[codigo] += 1
                estudiantes_por_codigo[codigo].add(e.usuario_id)

    por_lab = []
    for asig in asignaciones:
        lab_celdas = [c for c in celdas if c["laboratorio_id"] == asig.laboratorio_id]
        lab_envios = [e for e in evaluaciones if e.laboratorio_id == asig.laboratorio_id]
        mejores = [c["mejor_puntaje"] for c in lab_celdas if c["mejor_puntaje"] is not None]
        aceleraciones = [c["mejor_aceleracion"] for c in lab_celdas if c["mejor_aceleracion"] is not None]
        minutos = [c["minutos_hasta_aceptado"] for c in lab_celdas if c["minutos_hasta_aceptado"] is not None]
        envios_ok = [c["envios_hasta_aceptado"] for c in lab_celdas if c["envios_hasta_aceptado"] is not None]
        por_lab.append({
            "laboratorio": lab_resumen(asig.laboratorio),
            "estudiantes_con_intentos": sum(1 for c in lab_celdas if c["intentos"]),
            "aceptados": sum(1 for c in lab_celdas if c["aceptado"]),
            "intentos": len(lab_envios),
            "puntaje_medio": round(sum(mejores) / len(mejores), 1) if mejores else None,
            "mediana_aceleracion": round(median(aceleraciones), 2) if aceleraciones else None,
            "mediana_minutos_hasta_aceptado": round(median(minutos), 1) if minutos else None,
            "mediana_envios_hasta_aceptado": median(envios_ok) if envios_ok else None,
        })

    distribucion = [0] * 10
    for c in celdas:
        if c["mejor_puntaje"] is not None:
            distribucion[min(9, int(c["mejor_puntaje"] // 10))] += 1

    respuestas_sus = db.scalars(select(RespuestaSUS).where(RespuestaSUS.curso_id == curso.id)).all()
    puntajes_sus = [r.puntaje for r in respuestas_sus]
    sus_hist = [0] * 10
    for p in puntajes_sus:
        sus_hist[min(9, int(p // 10))] += 1

    return {
        "resumen": {
            "estudiantes": len(estudiantes),
            "laboratorios": len(asignaciones),
            "evaluaciones": len(evaluaciones),
            "ejecuciones": sum(1 for e in envios if e.tipo == "ejecucion"),
            "estudiantes_activos": len({e.usuario_id for e in envios}),
            "pares_aceptados": sum(1 for c in celdas if c["aceptado"]),
            "pares_totales": len(celdas),
            # Solo el total: el docente no debe saber quién autorizó el uso de sus datos (evita presión indebida).
            "consentimientos": sum(1 for e in estudiantes if e.consentimiento_investigacion),
        },
        "envios_por_dia": [{"fecha": d.isoformat(), **v} for d, v in dias.items()],
        "veredictos": [{"veredicto": k, "n": v} for k, v in veredictos.most_common()],
        "retro_frecuente": [
            {"codigo": k, "titulo": CATALOGO.get(k, k), "n": v, "estudiantes": len(estudiantes_por_codigo[k])}
            for k, v in codigos.most_common(12)
        ],
        "por_laboratorio": por_lab,
        "distribucion_puntajes": distribucion,
        "sus": {
            "activa": curso.encuesta_sus_activa,
            "resumen": resumen(puntajes_sus),
            "prueba_t": prueba_t_una_muestra(puntajes_sus, MU0_SUS, "mayor"),
            "histograma": sus_hist,
            "mu0": MU0_SUS,
        },
    }


def _csv(nombre: str, encabezado: list[str], filas: list[list]) -> StreamingResponse:
    buffer = io.StringIO()
    buffer.write("﻿")  # BOM para que Excel reconozca UTF-8
    escritor = csv.writer(buffer)
    escritor.writerow(encabezado)
    escritor.writerows(filas)
    buffer.seek(0)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


def _iso(fecha: datetime | None) -> str:
    return fecha.astimezone(timezone.utc).isoformat(timespec="seconds") if fecha else ""


@router.get("/cursos/{curso_id}/exportar/{tipo}")
def exportar(curso_id: int, tipo: str, usuario: Usuario = Depends(usuario_actual), db: Session = Depends(obtener_db)) -> StreamingResponse:
    """Exporta datos seudonimizados, solo de estudiantes que dieron consentimiento para investigación."""
    curso = curso_accesible(db, curso_id, usuario, gestion=True)
    estudiantes, asignaciones, envios, eventos = _datos_curso(db, curso.id)
    consienten = {e.id for e in estudiantes if e.consentimiento_investigacion}
    slugs = {a.laboratorio_id: a.laboratorio.slug for a in asignaciones}
    modelos = {a.laboratorio_id: a.laboratorio.modelo for a in asignaciones}
    prefijo = f"curso{curso.id}"
    if tipo == "envios.csv":
        intentos: Counter[tuple[int, int]] = Counter()
        filas = []
        for e in envios:
            if e.usuario_id not in consienten:
                continue
            numero = None
            if e.tipo == "evaluacion":
                intentos[(e.usuario_id, e.laboratorio_id)] += 1
                numero = intentos[(e.usuario_id, e.laboratorio_id)]
            filas.append([seudonimo(e.usuario_id), slugs.get(e.laboratorio_id, e.laboratorio_id), modelos.get(e.laboratorio_id, ""),
                          e.tipo, _iso(e.creado_en), e.veredicto or e.estado, e.puntaje, int(e.correcto), e.aceleracion, e.eficiencia,
                          int(bool((e.parametros or {}).get("tardio"))), numero, (e.parametros or {}).get("hilos")])
        return _csv(f"{prefijo}_envios.csv", ["estudiante", "laboratorio", "modelo", "tipo", "fecha_hora_utc", "veredicto",
                    "puntaje", "correcto", "aceleracion", "eficiencia", "tardio", "intento", "hilos_ejecucion"], filas)
    if tipo == "progreso.csv":
        filas = [[seudonimo(c["usuario_id"]), slugs.get(c["laboratorio_id"]), c["intentos"], c["mejor_puntaje"], int(c["aceptado"]),
                  c["envios_hasta_aceptado"], c["minutos_hasta_aceptado"], c["mejor_aceleracion"]]
                 for c in _celdas_progreso(estudiantes, asignaciones, envios, eventos) if c["usuario_id"] in consienten]
        return _csv(f"{prefijo}_progreso.csv", ["estudiante", "laboratorio", "intentos", "mejor_puntaje", "aceptado",
                    "envios_hasta_aceptado", "minutos_hasta_aceptado", "mejor_aceleracion"], filas)
    if tipo == "eventos.csv":
        todos = db.scalars(select(Evento).where(Evento.curso_id == curso.id).order_by(Evento.creado_en)).all()
        filas = [[seudonimo(e.usuario_id), e.tipo, slugs.get(e.laboratorio_id, ""), _iso(e.creado_en)]
                 for e in todos if e.usuario_id in consienten]
        return _csv(f"{prefijo}_eventos.csv", ["estudiante", "tipo", "laboratorio", "fecha_hora_utc"], filas)
    if tipo == "sus.csv":
        respuestas = db.scalars(select(RespuestaSUS).where(RespuestaSUS.curso_id == curso.id)).all()
        filas = [[seudonimo(r.usuario_id), *r.respuestas, r.puntaje, _iso(r.creado_en)] for r in respuestas if r.usuario_id in consienten]
        return _csv(f"{prefijo}_sus.csv", ["estudiante", *[f"item{i}" for i in range(1, 11)], "puntaje_sus", "fecha_hora_utc"], filas)
    raise HTTPException(404, "Tipo de exportación desconocido (envios.csv, progreso.csv, eventos.csv, sus.csv)")
