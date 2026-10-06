"""Herramientas del banco de laboratorios.

  python -m labpar.banco generar-salidas [--slug S]   compila referencia.c y escribe casos/*.salida
  python -m labpar.banco verificar [--slug S]         evalúa la solución docente y la plantilla con el motor
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from . import cargar_laboratorio, directorios_laboratorios


def _seleccion(slug: str | None) -> list[Path]:
    directorios = directorios_laboratorios()
    if slug:
        directorios = [d for d in directorios if d.name == slug]
        if not directorios:
            sys.exit(f"No existe el laboratorio «{slug}»")
    return directorios


def generar_salidas(slug: str | None) -> int:
    errores = 0
    for directorio in _seleccion(slug):
        lab = cargar_laboratorio(directorio)
        with tempfile.TemporaryDirectory() as tmp:
            binario = os.path.join(tmp, "referencia")
            compilacion = subprocess.run(["gcc", "-O2", "-std=gnu11", "-o", binario, str(directorio / "referencia.c"), "-lm"],
                                         capture_output=True, text=True)
            if compilacion.returncode != 0:
                print(f"✗ {lab['slug']}: la referencia no compila\n{compilacion.stderr}")
                errores += 1
                continue
            for caso in lab["casos"]:
                r = subprocess.run([binario], input=caso["entrada"], capture_output=True, text=True, timeout=120)
                if r.returncode != 0:
                    print(f"✗ {lab['slug']} / {caso['nombre']}: la referencia terminó con código {r.returncode}")
                    errores += 1
                    continue
                (directorio / "casos" / f"{caso['archivo']}.salida").write_text(r.stdout, encoding="utf-8")
            print(f"✓ {lab['slug']}: {len(lab['casos'])} salidas generadas")
    return errores


def verificar(slug: str | None, uid: int | None) -> int:
    from ..motor.capacidades import detectar
    from ..motor.evaluador import Contexto, Trabajo, procesar

    caps = detectar()
    errores = 0
    base = tempfile.mkdtemp(prefix="labpar_verificacion_")
    os.chmod(base, 0o755)
    ctx = Contexto(directorio_trabajos=os.path.join(base, "trabajos"), directorio_cache=os.path.join(base, "cache"),
                   uid=uid, gid=uid, capacidades=caps)
    try:
        for directorio in _seleccion(slug):
            lab = cargar_laboratorio(directorio)
            if not caps.get(lab["modelo"], {}).get("disponible"):
                print(f"– {lab['slug']}: {lab['modelo']} no disponible en este nodo; se omite")
                continue
            for etiqueta, codigo in (("solución", lab["solucion_docente"]), ("plantilla", lab["plantilla"])):
                trabajo = Trabajo(tipo="evaluacion", modelo=lab["modelo"], lenguaje=lab["lenguaje"], codigo=codigo,
                                  config=lab.get("config") or {}, casos=lab["casos"], referencia=lab["solucion_referencia"])
                r = procesar(trabajo, ctx)
                rend = r.get("rendimiento") or {}
                print(f"{lab['slug']:32s} {etiqueta:10s} → {r['veredicto']:24s} puntaje={(r.get('puntaje') or {}).get('total')} "
                      f"S={rend.get('aceleracion_max')} E={rend.get('eficiencia_pmax')} ({r['duracion_s']} s)")
                if etiqueta == "solución" and r["veredicto"] != "aceptado":
                    errores += 1
                    print(json.dumps(r.get("retroalimentacion"), ensure_ascii=False, indent=1)[:3000])
    finally:
        shutil.rmtree(base, ignore_errors=True)
    return errores


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m labpar.banco")
    sub = parser.add_subparsers(dest="orden", required=True)
    g = sub.add_parser("generar-salidas")
    g.add_argument("--slug")
    v = sub.add_parser("verificar")
    v.add_argument("--slug")
    v.add_argument("--uid", type=int, default=None, help="UID sin privilegios para ejecutar los programas (opcional)")
    args = parser.parse_args()
    if args.orden == "generar-salidas":
        sys.exit(1 if generar_salidas(args.slug) else 0)
    sys.exit(1 if verificar(args.slug, args.uid) else 0)


if __name__ == "__main__":
    main()
