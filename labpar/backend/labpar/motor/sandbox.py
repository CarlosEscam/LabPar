"""Ejecución aislada de procesos con límites de tiempo, CPU, memoria, archivos y procesos.

En el despliegue con Docker el trabajador corre dentro de un contenedor sin acceso a Internet y
los programas de los estudiantes se ejecutan con un usuario sin privilegios (LABPAR_UID_SANDBOX).
"""
from __future__ import annotations

import os
import resource
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass

ENTORNO_PERMITIDO = (
    "PATH",
    "LD_LIBRARY_PATH",
    "CUDA_HOME",
    "CUDA_VISIBLE_DEVICES",
    "NVIDIA_VISIBLE_DEVICES",
    "NVIDIA_DRIVER_CAPABILITIES",
)


@dataclass
class Limites:
    tiempo_s: float = 10.0
    cpu_s: float | None = None
    memoria_mb: int | None = None
    archivo_mb: int = 16
    procesos: int | None = None


@dataclass
class ResultadoProceso:
    codigo_salida: int | None
    senal: int | None
    stdout: str
    stderr: str
    tiempo_s: float
    tiempo_agotado: bool
    stdout_truncado: bool = False
    stderr_truncado: bool = False

    @property
    def exito(self) -> bool:
        return not self.tiempo_agotado and self.senal is None and self.codigo_salida == 0


def entorno_base(directorio: str, extra: dict[str, object] | None = None) -> dict[str, str]:
    """Entorno mínimo: no se heredan credenciales ni variables del servidor."""
    env = {k: os.environ[k] for k in ENTORNO_PERMITIDO if k in os.environ}
    env.setdefault("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    env.update(
        {
            "HOME": directorio,
            "TMPDIR": directorio,
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "MALLOC_ARENA_MAX": "4",
        }
    )
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    return env


def _leer(archivo, maximo: int) -> tuple[str, bool]:
    archivo.seek(0)
    datos = archivo.read(maximo + 1)
    return datos[:maximo].decode("utf-8", errors="replace"), len(datos) > maximo


def _matar_grupo(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def ejecutar(
    comando: list[str],
    directorio: str,
    *,
    entrada: str = "",
    limites: Limites | None = None,
    env: dict[str, str] | None = None,
    uid: int | None = None,
    gid: int | None = None,
    max_bytes: int = 1_000_000,
) -> ResultadoProceso:
    limites = limites or Limites()

    def preparar() -> None:  # se ejecuta en el proceso hijo, después de cambiar de usuario
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if limites.cpu_s:
            segundos = int(limites.cpu_s) + 1
            resource.setrlimit(resource.RLIMIT_CPU, (segundos, segundos + 1))
        if limites.memoria_mb:
            octetos = limites.memoria_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (octetos, octetos))
        tam = limites.archivo_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_FSIZE, (tam, tam))
        if limites.procesos:
            resource.setrlimit(resource.RLIMIT_NPROC, (limites.procesos, limites.procesos))

    opciones: dict[str, object] = {}
    if uid is not None and os.geteuid() == 0:
        opciones.update(user=uid, group=gid if gid is not None else uid, extra_groups=[])

    with tempfile.TemporaryFile() as salida, tempfile.TemporaryFile() as errores:
        inicio = time.perf_counter()
        try:
            proceso = subprocess.Popen(
                comando,
                cwd=directorio,
                stdin=subprocess.PIPE,
                stdout=salida,
                stderr=errores,
                env=env if env is not None else entorno_base(directorio),
                start_new_session=True,
                preexec_fn=preparar,
                close_fds=True,
                **opciones,
            )
        except OSError as exc:
            return ResultadoProceso(127, None, "", f"No se pudo ejecutar «{comando[0]}»: {exc}", 0.0, False)
        agotado = False
        try:
            proceso.communicate(input=entrada.encode("utf-8"), timeout=limites.tiempo_s)
        except subprocess.TimeoutExpired:
            agotado = True
            _matar_grupo(proceso.pid)
            proceso.communicate()
        transcurrido = time.perf_counter() - inicio
        _matar_grupo(proceso.pid)  # elimina procesos huérfanos (p. ej., rangos de MPI)
        stdout, stdout_truncado = _leer(salida, max_bytes)
        stderr, stderr_truncado = _leer(errores, max_bytes)

    codigo = proceso.returncode
    senal = -codigo if codigo is not None and codigo < 0 else None
    return ResultadoProceso(
        codigo_salida=codigo if codigo is not None and codigo >= 0 else None,
        senal=senal,
        stdout=stdout,
        stderr=stderr,
        tiempo_s=transcurrido,
        tiempo_agotado=agotado,
        stdout_truncado=stdout_truncado,
        stderr_truncado=stderr_truncado,
    )
