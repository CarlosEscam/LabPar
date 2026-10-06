"""Detección de los recursos locales disponibles en el nodo trabajador (núcleos, OpenMP, MPI y GPU)."""
from __future__ import annotations

import functools
import os
import shutil
import subprocess
import tempfile


def _ejecutar(comando: list[str], tiempo: float = 20.0) -> tuple[int, str]:
    try:
        p = subprocess.run(comando, capture_output=True, text=True, timeout=tiempo)
        return p.returncode, (p.stdout + p.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, str(exc)


def nucleos_disponibles() -> int:
    if hasattr(os, "sched_getaffinity"):
        return max(1, len(os.sched_getaffinity(0)))
    return max(1, os.cpu_count() or 1)


def _detectar_openmp() -> dict:
    if not shutil.which("gcc"):
        return {"disponible": False, "detalle": "No se encontró gcc"}
    _, version = _ejecutar(["gcc", "-dumpfullversion"])
    with tempfile.TemporaryDirectory() as tmp:
        fuente = os.path.join(tmp, "p.c")
        with open(fuente, "w", encoding="utf-8") as f:
            f.write("#include <omp.h>\nint main(void){int n=0;\n#pragma omp parallel reduction(+:n)\nn+=1;\nreturn n>0?0:1;}\n")
        codigo, salida = _ejecutar(["gcc", "-fopenmp", fuente, "-o", os.path.join(tmp, "p")])
    if codigo != 0:
        return {"disponible": False, "detalle": f"gcc {version} sin soporte OpenMP: {salida[:200]}"}
    return {"disponible": True, "detalle": f"GCC {version} con libgomp"}


def _detectar_mpi() -> dict:
    if not shutil.which("mpicc") or not (shutil.which("mpirun") or shutil.which("mpiexec")):
        return {"disponible": False, "detalle": "No se encontraron mpicc/mpirun", "implementacion": None}
    lanzador = "mpirun" if shutil.which("mpirun") else "mpiexec"
    _, version = _ejecutar([lanzador, "--version"])
    primera = version.splitlines()[0] if version else ""
    if "Open MPI" in version or "OpenRTE" in version:
        implementacion = "openmpi"
    elif "HYDRA" in version or "MPICH" in version.upper():
        implementacion = "mpich"
    else:
        implementacion = "desconocida"
    return {"disponible": True, "detalle": primera or lanzador, "implementacion": implementacion, "lanzador": lanzador}


def _detectar_cuda() -> dict:
    if not shutil.which("nvcc"):
        return {"disponible": False, "detalle": "No se encontró nvcc (CUDA Toolkit)", "gpus": []}
    _, version = _ejecutar(["nvcc", "--version"])
    linea_version = next((l for l in version.splitlines() if "release" in l), "nvcc")
    if not shutil.which("nvidia-smi"):
        return {"disponible": False, "detalle": "nvcc presente pero no hay controlador NVIDIA (nvidia-smi)", "gpus": []}
    codigo, salida = _ejecutar(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"])
    gpus = [l.strip() for l in salida.splitlines() if l.strip()] if codigo == 0 else []
    if not gpus:
        return {"disponible": False, "detalle": "No se detectó ninguna GPU NVIDIA", "gpus": []}
    return {"disponible": True, "detalle": linea_version.strip(), "gpus": gpus}


@functools.lru_cache(maxsize=1)
def detectar() -> dict:
    return {
        "nucleos": nucleos_disponibles(),
        "openmp": _detectar_openmp(),
        "mpi": _detectar_mpi(),
        "cuda": _detectar_cuda(),
    }
