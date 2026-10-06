"""Carga inicial: sincroniza el banco de laboratorios, crea el administrador y (opcional) datos de demostración.

  python -m labpar.semilla          sincroniza el banco y crea el administrador si no existe
  python -m labpar.semilla --demo   además crea un docente, un estudiante y un curso de demostración
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .banco import cargar_banco
from .config import config
from .db import SesionLocal, crear_tablas
from .modelos import Asignacion, CasoPrueba, Curso, Inscripcion, Laboratorio, Usuario
from .seguridad import hash_clave, verificar_clave

log = logging.getLogger("labpar.semilla")

# Cuentas publicadas en la pantalla de ingreso cuando LABPAR_DEMO=true.
CUENTAS_DEMO = (
    ("estudiante@labpar.local", "Estudiante de demostración", "estudiante", "estudiante123"),
    ("docente@labpar.local", "Docente de demostración", "docente", "docente123"),
)
CLAVE_ADMIN_DEMO = "admin12345"

CAMPOS_LAB = ("titulo", "modelo", "lenguaje", "nivel", "orden", "resumen", "enunciado_md", "plantilla", "solucion_referencia",
              "solucion_docente", "config", "objetivos", "conceptos", "preguntas", "pistas", "duracion_estimada_min")


def _huella(datos: dict) -> str:
    contenido = {k: datos.get(k) for k in CAMPOS_LAB}
    contenido["casos"] = [{k: c[k] for k in ("nombre", "entrada", "salida_esperada", "visible", "peso", "orden")} for c in datos["casos"]]
    return hashlib.sha256(json.dumps(contenido, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _aplicar(lab: Laboratorio, datos: dict) -> None:
    for campo in CAMPOS_LAB:
        valor = datos.get(campo)
        if valor is None and campo in ("config", "objetivos", "conceptos", "preguntas", "pistas"):
            valor = {} if campo == "config" else []
        if valor is not None:
            setattr(lab, campo, valor)
    lab.casos.clear()
    for caso in datos["casos"]:
        lab.casos.append(CasoPrueba(nombre=caso["nombre"], entrada=caso["entrada"], salida_esperada=caso["salida_esperada"],
                                    visible=caso["visible"], peso=caso["peso"], orden=caso["orden"]))


def sincronizar_banco(db: Session) -> dict:
    creados, actualizados, intactos = 0, 0, 0
    for datos in cargar_banco():
        huella = _huella(datos)
        lab = db.scalar(select(Laboratorio).where(Laboratorio.slug == datos["slug"]))
        if lab is None:
            lab = Laboratorio(slug=datos["slug"], del_banco=True, hash_banco=huella, publicado=True)
            _aplicar(lab, datos)
            db.add(lab)
            creados += 1
        elif lab.del_banco and lab.hash_banco is not None and lab.hash_banco != huella:
            _aplicar(lab, datos)
            lab.hash_banco = huella
            lab.version += 1
            actualizados += 1
        else:
            intactos += 1
    db.commit()
    return {"creados": creados, "actualizados": actualizados, "intactos": intactos}


def _usuario(db: Session, email: str, nombre: str, rol: str, clave: str) -> Usuario:
    usuario = db.scalar(select(Usuario).where(Usuario.email == email))
    if usuario is None:
        usuario = Usuario(email=email, nombre=nombre, rol=rol, hash_clave=hash_clave(clave),
                          consentimiento_investigacion=(rol == "estudiante"))
        db.add(usuario)
        db.flush()
    return usuario


def crear_administrador(db: Session) -> None:
    if db.scalar(select(Usuario.id).where(Usuario.rol == "admin")):
        return
    clave = config.admin_clave or (CLAVE_ADMIN_DEMO if config.modo_demo else secrets.token_urlsafe(12))
    _usuario(db, config.admin_email, "Administración LabPar", "admin", clave)
    db.commit()
    if not config.admin_clave and not config.modo_demo:
        ruta = config.directorio_datos / "clave_admin_inicial.txt"
        ruta.write_text(f"{config.admin_email}\n{clave}\n", encoding="utf-8")
        ruta.chmod(0o600)
        log.warning("Se creó el administrador %s; su contraseña inicial está en %s (cámbiala al ingresar)", config.admin_email, ruta)


def _cuenta_demo(db: Session, email: str, nombre: str, rol: str, clave: str) -> Usuario:
    """Crea la cuenta de demostración o, si ya existía con otra contraseña, le devuelve la publicada.

    Ocurre, por ejemplo, cuando la instalación arrancó primero sin LABPAR_DEMO: el administrador quedó con una
    contraseña aleatoria y la pantalla de ingreso anunciaría una que no funciona.
    """
    usuario = _usuario(db, email, nombre, rol, clave)
    if not verificar_clave(clave, usuario.hash_clave):
        usuario.hash_clave = hash_clave(clave)
        log.warning("Modo demostración: se restableció la contraseña publicada de %s", email)
    if not usuario.activo:
        usuario.activo = True
    return usuario


def crear_demo(db: Session) -> Curso:
    estudiante, docente = (_cuenta_demo(db, *cuenta) for cuenta in CUENTAS_DEMO)
    if not config.admin_clave:
        # Con LABPAR_ADMIN_CLAVE definida, la cuenta de administración no se publica ni se modifica.
        _cuenta_demo(db, config.admin_email, "Administración LabPar", "admin", CLAVE_ADMIN_DEMO)
    curso = db.scalar(select(Curso).where(Curso.codigo_inscripcion == "PPD262"))
    if curso is None:
        curso = Curso(nombre="Programación Paralela y Distribuida", periodo="2026-2",
                      descripcion="Curso de demostración con el banco inicial de laboratorios de OpenMP, MPI y CUDA.",
                      docente_id=docente.id, codigo_inscripcion="PPD262", encuesta_sus_activa=True)
        db.add(curso)
        db.flush()
    if not db.scalar(select(Inscripcion.id).where(Inscripcion.curso_id == curso.id, Inscripcion.usuario_id == estudiante.id)):
        db.add(Inscripcion(curso_id=curso.id, usuario_id=estudiante.id))
    asignados = set(db.scalars(select(Asignacion.laboratorio_id).where(Asignacion.curso_id == curso.id)).all())
    for lab in db.scalars(select(Laboratorio).where(Laboratorio.del_banco.is_(True))).all():
        if lab.id not in asignados:
            db.add(Asignacion(curso_id=curso.id, laboratorio_id=lab.id))
    db.commit()
    return curso


def sembrar(db: Session, demo: bool = False) -> dict:
    try:
        resumen = sincronizar_banco(db)
        crear_administrador(db)
        if demo:
            crear_demo(db)
        return resumen
    except IntegrityError:  # otro proceso sembró al mismo tiempo
        db.rollback()
        return {"creados": 0, "actualizados": 0, "intactos": 0}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="python -m labpar.semilla")
    parser.add_argument("--demo", action="store_true", help="crea cuentas y un curso de demostración")
    args = parser.parse_args()
    crear_tablas()
    with SesionLocal() as db:
        resumen = sembrar(db, demo=args.demo or config.modo_demo)
    print(f"Banco sincronizado: {resumen}")


if __name__ == "__main__":
    main()
