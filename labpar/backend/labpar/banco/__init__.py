"""Banco inicial de laboratorios (OpenMP, MPI y CUDA) incluido con la plataforma.

Cada laboratorio es una carpeta con:
  lab.yaml          metadatos, configuración de evaluación, casos, pistas y preguntas
  enunciado.md      enunciado en Markdown (admite fórmulas con $…$)
  plantilla.c|.cu   código inicial que ve el estudiante
  referencia.c      versión secuencial de referencia (define salidas esperadas y el tiempo T1)
  solucion.c|.cu    solución docente (nunca se muestra a los estudiantes)
  casos/*.entrada   entradas de los casos de prueba
  casos/*.salida    salidas esperadas, generadas con `python -m labpar.banco generar-salidas`
"""
from __future__ import annotations

from pathlib import Path

import yaml

DIRECTORIO_BANCO = Path(__file__).resolve().parent
EXTENSIONES = {"c": "c", "cpp": "cpp", "cuda": "cu"}


def _leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8") if ruta.exists() else ""


def directorios_laboratorios() -> list[Path]:
    return sorted(p for p in DIRECTORIO_BANCO.iterdir() if (p / "lab.yaml").exists())


def cargar_laboratorio(directorio: Path) -> dict:
    meta = yaml.safe_load(_leer(directorio / "lab.yaml")) or {}
    extension = EXTENSIONES.get(meta.get("lenguaje", "c"), "c")
    meta["enunciado_md"] = _leer(directorio / "enunciado.md")
    meta["plantilla"] = _leer(directorio / f"plantilla.{extension}")
    meta["solucion_docente"] = _leer(directorio / f"solucion.{extension}")
    meta["solucion_referencia"] = _leer(directorio / "referencia.c")
    casos = []
    for orden, caso in enumerate(meta.get("casos") or []):
        archivo = caso["archivo"]
        casos.append({
            "nombre": caso["nombre"],
            "archivo": archivo,
            "entrada": _leer(directorio / "casos" / f"{archivo}.entrada"),
            "salida_esperada": _leer(directorio / "casos" / f"{archivo}.salida"),
            "visible": bool(caso.get("visible", False)),
            "peso": float(caso.get("peso", 1.0)),
            "orden": orden,
        })
    meta["casos"] = casos
    meta["directorio"] = str(directorio)
    _validar_textos(meta, directorio)
    return meta


def _validar_textos(meta: dict, directorio: Path) -> None:
    """Falla al cargar si un texto del YAML quedó con otro tipo.

    Un texto sin comillas con «: » (por ejemplo «Nada: las sumas…») YAML lo lee como un diccionario,
    y la interfaz no puede mostrarlo. Se valida con los mismos esquemas que usa la API al crear laboratorios.
    """
    from pydantic import TypeAdapter, ValidationError

    from ..esquemas import Objetivo, Pregunta

    textos = TypeAdapter(list[str])
    try:
        meta["objetivos"] = [o.model_dump() for o in TypeAdapter(list[Objetivo]).validate_python(meta.get("objetivos") or [])]
        meta["preguntas"] = [q.model_dump() for q in TypeAdapter(list[Pregunta]).validate_python(meta.get("preguntas") or [])]
        meta["pistas"] = textos.validate_python(meta.get("pistas") or [])
        meta["conceptos"] = textos.validate_python(meta.get("conceptos") or [])
    except ValidationError as error:
        raise ValueError(f"{directorio.name}/lab.yaml tiene un texto mal formado (¿faltan comillas?): {error}") from error


def cargar_banco() -> list[dict]:
    laboratorios = [cargar_laboratorio(d) for d in directorios_laboratorios()]
    return sorted(laboratorios, key=lambda l: (l.get("orden", 100), l["slug"]))
