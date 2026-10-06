"""Trabajadores del motor de evaluación (capa de orquestación).

Cada proceso trabajador toma envíos pendientes de la base de datos (cola con prioridades), los procesa
con el motor y guarda el resultado. Se pueden ejecutar varios procesos por nodo y varios nodos
apuntando a la misma base de datos: el reclamo de cada envío es atómico.

  python -m labpar.worker                    usa LABPAR_TRABAJADORES procesos
  python -m labpar.worker --trabajadores 4
  python -m labpar.worker --una-vez           procesa la cola pendiente y termina (útil en pruebas)
"""
from __future__ import annotations

import argparse
import logging
import multiprocessing as mp
import os
import signal
import socket
import time
import traceback
from datetime import timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from .config import config
from .db import SesionLocal, ahora, crear_tablas
from .modelos import CasoPrueba, Envio, Laboratorio, Trabajador
from .motor.capacidades import detectar
from .motor.evaluador import Contexto, Trabajo, procesar, verificar_aislamiento
from .servicios import aplicar_resultado, casos_para_motor

log = logging.getLogger("labpar.worker")


def contexto_motor(capacidades: dict | None = None) -> Contexto:
    return Contexto(
        directorio_trabajos=str(config.directorio_trabajos),
        directorio_cache=str(config.directorio_cache),
        uid=config.uid_sandbox,
        gid=config.gid_sandbox if config.gid_sandbox is not None else config.uid_sandbox,
        capacidades=capacidades,
        max_hilos_ejecucion=config.max_hilos_ejecucion,
    )


def construir_trabajo(envio: Envio, lab: Laboratorio) -> Trabajo:
    parametros = envio.parametros or {}
    return Trabajo(
        tipo=envio.tipo,
        modelo=lab.modelo,
        lenguaje=lab.lenguaje,
        codigo=envio.codigo,
        config=lab.config or {},
        casos=casos_para_motor(lab),
        referencia=lab.solucion_referencia,
        hilos=parametros.get("hilos"),
        entrada=parametros.get("entrada"),
    )


MODELOS_MOTOR = ("openmp", "mpi", "cuda")


def modelos_atendidos(db: Session) -> set[str]:
    """Modelos que puede ejecutar algún trabajador activo (con latido reciente)."""
    limite = ahora() - timedelta(seconds=config.tiempo_maximo_trabajo_s + 30)
    activos = db.scalars(
        select(Trabajador).where(Trabajador.estado.in_(("libre", "ocupado")), Trabajador.ultimo_latido >= limite)
    ).all()
    return {m for t in activos for m in MODELOS_MOTOR if ((t.capacidades or {}).get(m) or {}).get("disponible")}


def reclamar(db: Session, nombre: str, capacidades: dict | None = None) -> Envio | None:
    """Reclama atómicamente el siguiente envío pendiente (sirve para SQLite y PostgreSQL).

    Con capacidades, el trabajador no toma envíos de modelos que él no ejecuta pero otro trabajador activo sí
    (por ejemplo, CUDA cuando hay un nodo con GPU). Sí toma los de modelos que nadie atiende, para responder
    «modelo no disponible» en lugar de dejarlos esperando indefinidamente.
    """
    consulta = select(Envio.id).where(Envio.estado == "pendiente")
    if capacidades is not None:
        propios = {m for m in MODELOS_MOTOR if (capacidades.get(m) or {}).get("disponible")}
        de_otros = modelos_atendidos(db) - propios
        if de_otros:
            consulta = consulta.join(Laboratorio, Laboratorio.id == Envio.laboratorio_id).where(
                or_(Envio.tipo == "referencia", Laboratorio.modelo.not_in(de_otros))
            )
    candidatos = db.scalars(consulta.order_by(Envio.prioridad.desc(), Envio.id).limit(8)).all()
    for envio_id in candidatos:
        resultado = db.execute(
            update(Envio)
            .where(Envio.id == envio_id, Envio.estado == "pendiente")
            .values(estado="ejecutando", trabajador=nombre, iniciado_en=ahora(), intentos_proceso=Envio.intentos_proceso + 1)
        )
        db.commit()
        if resultado.rowcount == 1:
            return db.get(Envio, envio_id)
    return None


def procesar_envio(db: Session, envio: Envio, ctx: Contexto) -> None:
    lab = db.get(Laboratorio, envio.laboratorio_id)
    if lab is None:
        envio.estado, envio.veredicto, envio.finalizado_en = "error", "error_interno", ahora()
        db.commit()
        return
    trabajo = construir_trabajo(envio, lab)
    resultado = procesar(trabajo, ctx)
    db.refresh(envio)
    aplicar_resultado(envio, resultado)
    envio.estado = "error" if resultado.get("veredicto") == "error_interno" else "completado"
    envio.finalizado_en = ahora()
    if envio.tipo == "referencia" and (envio.parametros or {}).get("actualizar_casos"):
        actualizados = 0
        for caso_res in resultado.get("casos", []):
            caso = db.get(CasoPrueba, caso_res.get("id")) if caso_res.get("id") else None
            if caso is not None and caso.laboratorio_id == lab.id and caso_res.get("ok"):
                caso.salida_esperada = caso_res["salida"]
                actualizados += 1
        if actualizados:
            lab.version += 1
            lab.hash_banco = None
        resultado["casos_actualizados"] = actualizados
        envio.resultado = resultado
    db.commit()


def _latido(db: Session, nombre: str, **valores) -> None:
    db.execute(update(Trabajador).where(Trabajador.id == nombre).values(ultimo_latido=ahora(), **valores))
    db.commit()


def bucle_trabajador(nombre: str, capacidades: dict, detener, una_vez: bool = False) -> None:
    """Ciclo de un proceso trabajador (se ejecuta en un proceso hijo)."""
    signal.signal(signal.SIGINT, signal.SIG_IGN)  # el proceso principal coordina la detención
    logging.basicConfig(level=logging.INFO, format=f"%(asctime)s %(levelname)s [{nombre}] %(message)s")
    ctx = contexto_motor(capacidades)
    with SesionLocal() as db:
        existente = db.get(Trabajador, nombre)
        if existente is None:
            db.add(Trabajador(id=nombre, host=socket.gethostname(), pid=os.getpid(), capacidades=capacidades, estado="libre"))
        else:
            existente.pid, existente.capacidades, existente.estado = os.getpid(), capacidades, "libre"
            existente.iniciado_en = ahora()
        db.commit()
        ultimo_latido = 0.0
        while not detener.is_set():
            if time.monotonic() - ultimo_latido > 5:
                _latido(db, nombre, estado="libre", envio_actual=None)
                ultimo_latido = time.monotonic()
            envio = reclamar(db, nombre, capacidades)
            if envio is None:
                if una_vez:
                    break
                detener.wait(0.5)
                continue
            log.info("Procesando envío %s (%s, laboratorio %s)", envio.id, envio.tipo, envio.laboratorio_id)
            _latido(db, nombre, estado="ocupado", envio_actual=envio.id)
            inicio = time.monotonic()
            try:
                procesar_envio(db, envio, ctx)
                db.execute(update(Trabajador).where(Trabajador.id == nombre).values(procesados=Trabajador.procesados + 1))
            except Exception:  # pragma: no cover - errores inesperados
                db.rollback()
                log.error("Error procesando el envío %s:\n%s", envio.id, traceback.format_exc())
                db.execute(update(Envio).where(Envio.id == envio.id).values(estado="error", veredicto="error_interno",
                                                                          finalizado_en=ahora()))
                db.execute(update(Trabajador).where(Trabajador.id == nombre).values(fallidos=Trabajador.fallidos + 1))
            db.commit()
            log.info("Envío %s terminado en %.1f s", envio.id, time.monotonic() - inicio)
            _latido(db, nombre, estado="libre", envio_actual=None)
            ultimo_latido = time.monotonic()
        _latido(db, nombre, estado="detenido", envio_actual=None)


def recuperar_huerfanos(db: Session) -> int:
    """Devuelve a la cola los envíos de trabajadores que murieron a mitad de proceso."""
    limite = ahora() - timedelta(seconds=config.tiempo_maximo_trabajo_s)
    huerfanos = db.scalars(select(Envio).where(Envio.estado == "ejecutando", or_(Envio.iniciado_en.is_(None), Envio.iniciado_en < limite))).all()
    for envio in huerfanos:
        if envio.intentos_proceso >= 3:
            envio.estado, envio.veredicto, envio.finalizado_en = "error", "error_interno", ahora()
        else:
            envio.estado, envio.trabajador, envio.iniciado_en = "pendiente", None, None
    db.commit()
    return len(huerfanos)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m labpar.worker")
    parser.add_argument("--trabajadores", type=int, default=config.trabajadores)
    parser.add_argument("--una-vez", action="store_true", help="procesa la cola pendiente y termina")
    args = parser.parse_args()

    crear_tablas()
    capacidades = detectar()
    log.info("Recursos locales detectados: %s núcleos · OpenMP: %s · MPI: %s · CUDA: %s", capacidades["nucleos"],
             capacidades["openmp"]["detalle"], capacidades["mpi"]["detalle"], capacidades["cuda"]["detalle"])
    if config.uid_sandbox is None and os.geteuid() == 0:
        log.warning("El trabajador corre como root sin LABPAR_UID_SANDBOX: los programas de los estudiantes no se aíslan por usuario")
    problema = verificar_aislamiento(contexto_motor(capacidades))
    if problema:
        log.error(problema)
        raise SystemExit(2)

    contexto = mp.get_context("spawn")
    detener = contexto.Event()
    host = socket.gethostname()
    procesos = []
    for i in range(max(1, args.trabajadores)):
        nombre = f"{host}-{i + 1}"
        p = contexto.Process(target=bucle_trabajador, args=(nombre, capacidades, detener, args.una_vez), name=nombre, daemon=False)
        p.start()
        procesos.append(p)

    def _detener(*_):
        log.info("Deteniendo trabajadores…")
        detener.set()

    signal.signal(signal.SIGTERM, _detener)
    signal.signal(signal.SIGINT, _detener)
    ultimo_rescate = 0.0
    while any(p.is_alive() for p in procesos):
        if not args.una_vez and time.monotonic() - ultimo_rescate > 30:
            with SesionLocal() as db:
                n = recuperar_huerfanos(db)
            if n:
                log.warning("Se devolvieron %d envíos huérfanos a la cola", n)
            ultimo_rescate = time.monotonic()
        for p in procesos:
            p.join(timeout=1)
    log.info("Trabajadores detenidos")


if __name__ == "__main__":
    main()
