"""Pipeline de evaluación automática.

Fases de una evaluación completa:
  1. Requisitos y heurísticas estáticas.
  2. Compilación (con diagnósticos explicados en español).
  3. Corrección: cada caso de prueba se ejecuta con varios valores de p (hilos o procesos) y varias
     repeticiones, para detectar condiciones de carrera, no determinismo e interbloqueos.
  4. Rendimiento: con acceso exclusivo al nodo, se mide la versión secuencial de referencia y el programa
     del estudiante con distintos p; se calculan aceleración, eficiencia y la métrica de Karp–Flatt.
  5. Puntaje y retroalimentación formativa.
"""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import os
import re
import shutil
import socket
import tempfile
import time
from collections.abc import Iterator
from dataclasses import dataclass, field

from . import puntaje
from .capacidades import detectar
from .comparacion import comparar
from .compilacion import analizar_diagnosticos, comando_compilacion, limpiar_rutas, nombre_fuente
from .heuristicas import analizar, verificar_requisitos
from .retro import Retro
from .sandbox import Limites, ResultadoProceso, ejecutar, entorno_base

CONFIG_POR_DEFECTO: dict = {
    "hilos_correccion": [1, 4],
    "repeticiones_correccion": 2,
    "hilos_rendimiento": [1, 2, 4, 8],
    "repeticiones_rendimiento": 3,
    "tiempo_limite_s": 10,
    "tiempo_limite_rendimiento_s": 30,
    "tiempo_total_correccion_s": 120,
    "memoria_mb": 512,
    "comparacion": "tokens",
    "tolerancia_rel": 1e-9,
    "tolerancia_abs": 1e-12,
    "peso_correccion": 70,
    "peso_rendimiento": 30,
    "eficiencia_objetivo": 0.6,
    "aceleracion_objetivo": None,
    "entrada_rendimiento": None,
    "requisitos": [],
    "prohibidos": [],
    "flags_compilacion": [],
    "pistas_rendimiento": [],
}

PATRON_TIEMPO = re.compile(r"^\s*LABPAR_TIEMPO\s*=\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*$", re.MULTILINE)
MAX_EXTRACTO = 4000

SUGERENCIAS_RENDIMIENTO = {
    "openmp": [
        "Crea la región paralela una sola vez, fuera de los bucles externos.",
        "Acumula con reduction en lugar de critical o atomic dentro del bucle.",
        "Si las iteraciones tienen costos distintos, prueba schedule(dynamic, bloque) o schedule(guided).",
        "Evita el falso compartir: que hilos distintos no escriban en cada iteración posiciones contiguas de un arreglo compartido.",
    ],
    "mpi": [
        "Balancea el trabajo: reparte por bloques y distribuye el resto (n % p) entre los primeros procesos.",
        "Reduce la cantidad de mensajes: agrupa datos y prefiere operaciones colectivas.",
        "Evita que el proceso 0 haga secuencialmente trabajo que podría repartirse.",
    ],
    "cuda": [
        "Minimiza las transferencias entre host y dispositivo: copia los datos una sola vez.",
        "Usa bloques de 128 a 512 hilos (múltiplos de 32) y suficientes bloques para ocupar todos los multiprocesadores.",
        "Reutiliza datos dentro del bloque con memoria compartida (__shared__).",
    ],
}

NOMBRES_P = {"openmp": "hilos", "mpi": "procesos", "cuda": "hilos de GPU"}


def _n(valor: float, decimales: int = 2) -> str:
    """Número con coma decimal, como se escribe en español de Colombia."""
    return f"{valor:.{decimales}f}".replace(".", ",")


def configuracion_efectiva(config: dict | None) -> dict:
    return {**CONFIG_POR_DEFECTO, **(config or {})}


@dataclass
class Contexto:
    directorio_trabajos: str
    directorio_cache: str
    uid: int | None = None
    gid: int | None = None
    capacidades: dict | None = None
    nombre_nodo: str = field(default_factory=socket.gethostname)
    max_hilos_ejecucion: int = 8

    def caps(self) -> dict:
        if self.capacidades is None:
            self.capacidades = detectar()
        return self.capacidades


@dataclass
class Trabajo:
    tipo: str  # evaluacion | ejecucion | referencia
    modelo: str  # openmp | mpi | cuda
    lenguaje: str
    codigo: str
    config: dict
    casos: list[dict]
    referencia: str = ""
    hilos: int | None = None
    entrada: str | None = None


# --------------------------------------------------------------------------------------------
# Candado lector–escritor con preferencia de escritura (flock sobre dos archivos):
#   - las compilaciones y pruebas de corrección toman el candado compartido;
#   - la medición de rendimiento toma el candado exclusivo para tener el nodo dedicado.
# --------------------------------------------------------------------------------------------
class CandadoRendimiento:
    def __init__(self, directorio: str) -> None:
        os.makedirs(directorio, exist_ok=True)
        self._torniquete = os.path.join(directorio, "torniquete.lock")
        self._recurso = os.path.join(directorio, "rendimiento.lock")

    @contextlib.contextmanager
    def compartido(self) -> Iterator[None]:
        with open(self._torniquete, "a+") as t, open(self._recurso, "a+") as r:
            fcntl.flock(t, fcntl.LOCK_EX)
            fcntl.flock(r, fcntl.LOCK_SH)
            fcntl.flock(t, fcntl.LOCK_UN)
            try:
                yield
            finally:
                fcntl.flock(r, fcntl.LOCK_UN)

    @contextlib.contextmanager
    def exclusivo(self) -> Iterator[None]:
        with open(self._torniquete, "a+") as t, open(self._recurso, "a+") as r:
            fcntl.flock(t, fcntl.LOCK_EX)
            try:
                fcntl.flock(r, fcntl.LOCK_EX)
                try:
                    yield
                finally:
                    fcntl.flock(r, fcntl.LOCK_UN)
            finally:
                fcntl.flock(t, fcntl.LOCK_UN)


# --------------------------------------------------------------------------------------------
# Utilidades de ejecución
# --------------------------------------------------------------------------------------------
def _preparar_directorio(ctx: Contexto) -> str:
    os.makedirs(ctx.directorio_trabajos, exist_ok=True)
    with contextlib.suppress(PermissionError):
        os.chmod(ctx.directorio_trabajos, 0o711)
    directorio = tempfile.mkdtemp(prefix="envio_", dir=ctx.directorio_trabajos)
    if ctx.uid is not None and os.geteuid() == 0:
        os.chown(directorio, ctx.uid, ctx.gid if ctx.gid is not None else ctx.uid)
    os.chmod(directorio, 0o755)
    return directorio


def verificar_aislamiento(ctx: Contexto) -> str | None:
    """Comprueba que el usuario del aislamiento puede ejecutar programas en el directorio de trabajos.

    Si algún directorio padre no permite el paso (x) a otros usuarios, la compilación funciona (el proceso ya está
    dentro del directorio) pero la ejecución con ruta absoluta falla con «Permission denied» en todos los envíos.
    """
    if ctx.uid is None or os.geteuid() != 0:
        return None
    origen = shutil.which("true")
    if origen is None:
        return None
    directorio = _preparar_directorio(ctx)
    try:
        destino = os.path.join(directorio, "prueba")
        shutil.copy2(origen, destino)
        os.chmod(destino, 0o755)
        r = ejecutar([destino], directorio, limites=Limites(tiempo_s=10), env=entorno_base(directorio), uid=ctx.uid, gid=ctx.gid)
        if r.exito:
            return None
        return (f"El usuario del aislamiento (uid {ctx.uid}) no puede ejecutar programas en {ctx.directorio_trabajos}: "
                f"{(r.stderr or '').strip() or f'código {r.codigo_salida}'}. Verifica que todos los directorios padres "
                "permitan el paso (permiso x) a otros usuarios o usa otro LABPAR_TRABAJOS.")
    finally:
        shutil.rmtree(directorio, ignore_errors=True)


def _escribir(directorio: str, nombre: str, contenido: str) -> str:
    ruta = os.path.join(directorio, nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(contenido)
    os.chmod(ruta, 0o644)
    return ruta


def _extracto(texto: str, maximo: int = MAX_EXTRACTO) -> str:
    return texto if len(texto) <= maximo else texto[:maximo] + "\n… (salida truncada)"


def _tiempo_interno(stderr: str) -> float | None:
    valores = [float(v) for v in PATRON_TIEMPO.findall(stderr)]
    return max(valores) if valores else None


def compilar(modelo: str, lenguaje: str, codigo: str, directorio: str, ctx: Contexto, flags: list[str] | None = None,
             nombre_binario: str = "programa") -> dict:
    fuente = "referencia.c" if modelo == "secuencial" else nombre_fuente(lenguaje)
    _escribir(directorio, fuente, codigo)
    comando = comando_compilacion(modelo, "c" if modelo == "secuencial" else lenguaje, fuente, nombre_binario, flags)
    r = ejecutar(comando, directorio, limites=Limites(tiempo_s=90, memoria_mb=None, archivo_mb=128),
                 env=entorno_base(directorio), uid=ctx.uid, gid=ctx.gid)
    salida = limpiar_rutas((r.stdout + "\n" + r.stderr).strip(), directorio)
    ok = r.exito and os.path.exists(os.path.join(directorio, nombre_binario))
    if r.tiempo_agotado:
        salida += "\nLa compilación excedió el tiempo límite."
    return {
        "ok": ok,
        "comando": " ".join(comando),
        "salida": _extracto(salida, 20000),
        "diagnosticos": analizar_diagnosticos(salida),
        "tiempo_s": round(r.tiempo_s, 3),
    }


def _comando_ejecucion(modelo: str, binario: str, p: int, ctx: Contexto) -> tuple[list[str], dict[str, object]]:
    if modelo == "openmp":
        return [binario], {"OMP_NUM_THREADS": p, "OMP_DYNAMIC": "false"}
    if modelo == "mpi":
        mpi = ctx.caps().get("mpi", {})
        lanzador = mpi.get("lanzador") or "mpirun"
        if mpi.get("implementacion") == "openmpi":
            comando = [lanzador, "-np", str(p), "--oversubscribe", "--bind-to", "none"]
            entorno: dict[str, object] = {
                "OMP_NUM_THREADS": 1,
                "OMPI_MCA_btl_vader_single_copy_mechanism": "none",
                "OMPI_MCA_rmaps_base_oversubscribe": "1",
                # Un solo nodo: memoria compartida entre procesos y control por la interfaz de bucle local.
                # Así MPI funciona aunque el contenedor bloquee la red para el usuario del aislamiento.
                "OMPI_MCA_btl": "self,vader",
                "OMPI_MCA_oob_tcp_if_include": "lo",
            }
            if os.geteuid() == 0 and ctx.uid is None:
                comando.append("--allow-run-as-root")
                entorno.update(OMPI_ALLOW_RUN_AS_ROOT=1, OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1)
            return [*comando, binario], entorno
        return [lanzador, "-n", str(p), binario], {"OMP_NUM_THREADS": 1}
    if modelo == "cuda":
        return [binario], {}
    if modelo == "secuencial":
        return [binario], {"OMP_NUM_THREADS": 1}
    raise ValueError(modelo)


def ejecutar_programa(modelo: str, binario: str, directorio: str, entrada: str, p: int, cfg: dict, ctx: Contexto,
                      tiempo_s: float) -> ResultadoProceso:
    comando, extra = _comando_ejecucion(modelo, binario, p, ctx)
    if modelo == "openmp":
        memoria = int(cfg["memoria_mb"]) + 64 * p + 256
    elif modelo == "secuencial":
        memoria = int(cfg["memoria_mb"]) + 256
    else:
        memoria = None  # MPI y CUDA reservan mucho espacio virtual: se limitan con cgroups en el contenedor
    limites = Limites(
        tiempo_s=tiempo_s,
        cpu_s=tiempo_s * max(1, p) + 2,
        memoria_mb=memoria,
        archivo_mb=16,
        procesos=1024 if ctx.uid is not None else None,
    )
    return ejecutar(comando, directorio, entrada=entrada, limites=limites, env=entorno_base(directorio, extra),
                    uid=ctx.uid, gid=ctx.gid)


def _veredicto_proceso(r: ResultadoProceso) -> str:
    if r.tiempo_agotado:
        return "TLE"
    if r.senal is not None or r.codigo_salida != 0:
        return "RE"
    return "OK"


_SENAL_MPI = re.compile(r"exited on signal (\d+)|signal (\d+) \(")


def retro_error_ejecucion(r: ResultadoProceso, modelo: str, contexto: str = "") -> Retro:
    senal = r.senal
    if senal is None:
        m = _SENAL_MPI.search(r.stderr)
        if m:
            senal = int(m.group(1) or m.group(2))
    sufijo = f" {contexto}" if contexto else ""
    if re.search(r"CUDA error|cudaError|cudaErrorNoDevice|no CUDA-capable device", r.stderr):
        return Retro("error", "CUDA_ERROR_EJECUCION", f"La GPU reportó un error{sufijo}: {_extracto(r.stderr.strip(), 300)}")
    if senal in (11, 7):
        return Retro("error", "SEGFAULT", f"El programa accedió a memoria inválida (violación de segmento){sufijo}. "
                     "Revisa índices fuera de rango, punteros sin inicializar y arreglos demasiado grandes para la pila "
                     "(decláralos con malloc o como static).")
    if senal == 8:
        return Retro("error", "DIV_CERO", f"Excepción aritmética (por ejemplo, división entera entre cero){sufijo}. "
                     "Revisa divisiones como n / p cuando algún valor puede ser 0.")
    if senal == 6:
        return Retro("error", "ABORTO", f"El programa abortó (abort, assert o memoria liberada dos veces){sufijo}.")
    if senal == 25:
        return Retro("error", "SALIDA_EXCESIVA", f"El programa escribió demasiada salida{sufijo}: imprime solo lo que pide el enunciado.")
    if senal == 24:
        return Retro("error", "TIEMPO_EXCEDIDO", f"Se agotó el tiempo de CPU asignado{sufijo}.")
    if senal == 9 or re.search(r"bad_alloc|Cannot allocate memory|out of memory", r.stderr, re.IGNORECASE):
        return Retro("error", "MEMORIA", f"El proceso fue terminado por exceder la memoria o un límite de recursos{sufijo}. "
                     "Evita reservas enormes o ilimitadas.")
    if "MPI_ABORT" in r.stderr:
        return Retro("error", "CODIGO_SALIDA", f"Algún proceso llamó a MPI_Abort{sufijo}.")
    codigo = r.codigo_salida
    return Retro("error", "CODIGO_SALIDA", f"El programa terminó con código de salida {codigo}{sufijo}: main debe retornar 0 "
                 "cuando termina correctamente.")


# --------------------------------------------------------------------------------------------
# Fases
# --------------------------------------------------------------------------------------------
def _fase_correccion(trabajo: Trabajo, cfg: dict, directorio: str, ctx: Contexto, candado: CandadoRendimiento) -> list[dict]:
    hilos = [1] if trabajo.modelo == "cuda" else sorted({max(1, int(p)) for p in cfg["hilos_correccion"]})
    repeticiones = max(1, int(cfg["repeticiones_correccion"]))
    limite = float(cfg["tiempo_limite_s"])
    fin_presupuesto = time.monotonic() + float(cfg["tiempo_total_correccion_s"])
    binario = os.path.join(directorio, "programa")
    resultados: list[dict] = []
    # Si un valor de p agota el tiempo, los casos siguientes no se ejecutan con ese p (falla rápida):
    # un interbloqueo o un bucle infinito costaría el tiempo límite en cada caso.
    bloqueados: set[int] = set()
    for caso in trabajo.casos:
        ejecuciones: list[dict] = []
        salidas: dict[int, list[str]] = {}
        detalle: dict | None = None
        for p in hilos:
            for rep in range(repeticiones):
                if p in bloqueados or time.monotonic() > fin_presupuesto:
                    ejecuciones.append({"p": p, "rep": rep + 1, "veredicto": "OMITIDO", "tiempo_s": None})
                    break
                with candado.compartido():
                    r = ejecutar_programa(trabajo.modelo, binario, directorio, caso.get("entrada", ""), p, cfg, ctx, limite)
                veredicto = _veredicto_proceso(r)
                comparacion = None
                if veredicto == "OK":
                    comparacion = comparar(caso.get("salida_esperada", ""), r.stdout, cfg["comparacion"],
                                           float(cfg["tolerancia_rel"]), float(cfg["tolerancia_abs"]))
                    veredicto = "AC" if comparacion.ok else "WA"
                salidas.setdefault(p, []).append(r.stdout.strip())
                ejecuciones.append({
                    "p": p, "rep": rep + 1, "veredicto": veredicto, "tiempo_s": round(r.tiempo_s, 4),
                    "senal": r.senal, "codigo_salida": r.codigo_salida,
                })
                if veredicto != "AC" and detalle is None:
                    detalle = {
                        "p": p,
                        "rep": rep + 1,
                        "veredicto": veredicto,
                        "comparacion": comparacion.como_dict() if comparacion else None,
                        "stdout": _extracto(r.stdout),
                        "stderr": _extracto(limpiar_rutas(r.stderr, directorio)),
                        "_proceso": r,
                    }
                if veredicto == "TLE":
                    bloqueados.add(p)
                    break
        validas = [e for e in ejecuciones if e["veredicto"] != "OMITIDO"]
        aprobado = bool(validas) and all(e["veredicto"] == "AC" for e in validas) and len(validas) == len(ejecuciones)
        orden = {"RE": 0, "TLE": 1, "WA": 2, "OMITIDO": 3, "AC": 4}
        peor = min((e["veredicto"] for e in ejecuciones), key=lambda v: orden.get(v, 9), default="OMITIDO")
        resultados.append({
            "id": caso.get("id"),
            "nombre": caso.get("nombre", "Caso"),
            "visible": bool(caso.get("visible")),
            "peso": float(caso.get("peso", 1.0)),
            "aprobado": aprobado,
            "veredicto": "AC" if aprobado else peor,
            "ejecuciones": ejecuciones,
            "detalle": detalle,
            "salidas_distintas": {p: len(set(v)) > 1 for p, v in salidas.items()},
            "entrada": _extracto(caso.get("entrada", ""), 2000),
            "esperada": _extracto(caso.get("salida_esperada", ""), 2000),
        })
    return resultados


def _diagnostico_dinamico(trabajo: Trabajo, casos: list[dict]) -> list[Retro]:
    """Interpreta los patrones de fallo según p para sugerir la causa más probable."""
    retro: dict[str, Retro] = {}
    for caso in casos:
        if caso["aprobado"]:
            continue
        por_p: dict[int, list[str]] = {}
        for e in caso["ejecuciones"]:
            por_p.setdefault(e["p"], []).append(e["veredicto"])
        uno_ok = all(v == "AC" for v in por_p.get(1, ["?"]))
        fallos_par = {p: v for p, v in por_p.items() if p > 1 and any(x != "AC" for x in v)}
        nombre = caso["nombre"]
        detalle = caso.get("detalle") or {}
        if uno_ok and fallos_par:
            p = min(fallos_par)
            veredictos = fallos_par[p]
            if "TLE" in veredictos:
                if trabajo.modelo == "mpi":
                    retro.setdefault("INTERBLOQUEO", Retro("error", "INTERBLOQUEO",
                        f"En «{nombre}» el programa termina con 1 proceso pero no con p = {p}: es el síntoma típico de un "
                        "interbloqueo. Verifica que cada MPI_Send tenga su MPI_Recv (mismo origen, destino, etiqueta y "
                        "comunicador) y que los procesos no queden esperándose mutuamente."))
                else:
                    retro.setdefault("ESPERA_INFINITA", Retro("error", "ESPERA_INFINITA",
                        f"En «{nombre}» el programa termina con 1 hilo pero no con p = {p}. Revisa barreras dentro de "
                        "condicionales, esperas activas sobre variables compartidas o secciones críticas anidadas."))
            elif "RE" in veredictos and detalle.get("_proceso") is not None:
                retro.setdefault("RE_PAR", retro_error_ejecucion(detalle["_proceso"], trabajo.modelo, f"con p = {p} en «{nombre}»"))
            else:
                if caso["salidas_distintas"].get(p):
                    retro.setdefault("NO_DETERMINISMO", Retro("error", "NO_DETERMINISMO",
                        f"Con p = {p} el caso «{nombre}» produjo resultados distintos en ejecuciones repetidas con la misma "
                        "entrada: el resultado depende del orden en que avanzan los hilos o procesos."))
                if trabajo.modelo == "mpi":
                    retro.setdefault("REPARTO_INCORRECTO", Retro("error", "REPARTO_INCORRECTO",
                        f"«{nombre}» es correcto con 1 proceso pero no con p = {p}. Revisa el reparto del trabajo (¿cubres "
                        "todos los elementos cuando n no es divisible por p?) y la combinación de los resultados parciales."))
                else:
                    retro.setdefault("CARRERA_PROBABLE", Retro("error", "CARRERA_PROBABLE",
                        f"«{nombre}» es correcto con 1 hilo pero no con p = {p}. "
                        "Es el síntoma típico de una condición de carrera: varios hilos actualizan la misma variable "
                        "compartida sin sincronización. Usa reduction, private o atomic según el caso."))
        else:
            veredictos_uno = por_p.get(1, [])
            if "TLE" in veredictos_uno:
                retro.setdefault("TIEMPO_EXCEDIDO", Retro("error", "TIEMPO_EXCEDIDO",
                    f"«{nombre}» excede el tiempo límite incluso con 1 {('proceso' if trabajo.modelo == 'mpi' else 'hilo')}. "
                    "Verifica que no haya bucles infinitos y que leas la entrada como indica el enunciado."))
            elif "RE" in veredictos_uno and detalle.get("_proceso") is not None:
                retro.setdefault("RE_UNO", retro_error_ejecucion(detalle["_proceso"], trabajo.modelo, f"en «{nombre}»"))
            elif "WA" in veredictos_uno or trabajo.modelo == "cuda":
                comp = (detalle.get("comparacion") or {})
                pista = ""
                if comp.get("esperado") is not None:
                    pista = f" En la línea {comp.get('linea')} se esperaba «{comp.get('esperado')}» y se obtuvo «{comp.get('obtenido')}»."
                retro.setdefault("ERROR_LOGICO", Retro("error", "ERROR_LOGICO",
                    f"«{nombre}» falla incluso sin paralelismo: el error está en la lógica o en el formato de salida.{pista}"))
    return list(retro.values())


def _binario_referencia(trabajo: Trabajo, cfg: dict, ctx: Contexto, candado: CandadoRendimiento) -> tuple[str | None, dict]:
    clave = hashlib.sha256((trabajo.referencia + "|" + " ".join(cfg.get("flags_referencia", []))).encode()).hexdigest()[:20]
    destino = os.path.join(ctx.directorio_cache, "referencias", clave)
    binario = os.path.join(destino, "referencia")
    if os.path.exists(binario):
        return binario, {"ok": True, "cache": True}
    temporal = _preparar_directorio(ctx)
    try:
        with candado.compartido():
            info = compilar("secuencial", "c", trabajo.referencia, temporal, ctx, cfg.get("flags_referencia"), "referencia")
        if not info["ok"]:
            return None, info
        os.makedirs(destino, exist_ok=True)
        for ruta in (os.path.join(ctx.directorio_cache, "referencias"), destino):
            with contextlib.suppress(PermissionError):
                os.chmod(ruta, 0o755)
        shutil.copy2(os.path.join(temporal, "referencia"), binario + ".tmp")
        os.chmod(binario + ".tmp", 0o755)
        os.replace(binario + ".tmp", binario)
        return binario, info
    finally:
        shutil.rmtree(temporal, ignore_errors=True)


def _medir(modelo: str, binario: str, directorio: str, entrada: str, p: int, repeticiones: int, cfg: dict,
           ctx: Contexto, umbral_lento_s: float | None = None) -> tuple[list[dict], ResultadoProceso | None, str]:
    """Ejecuta varias repeticiones; si la primera ya es muy lenta (umbral), no se repite."""
    medidas: list[dict] = []
    limite = float(cfg["tiempo_limite_rendimiento_s"])
    salida = ""
    for i in range(repeticiones):
        r = ejecutar_programa(modelo, binario, directorio, entrada, p, cfg, ctx, limite)
        if not r.exito:
            return medidas, r, salida
        if i == 0:
            salida = r.stdout
        medidas.append({"externo": r.tiempo_s, "interno": _tiempo_interno(r.stderr)})
        if umbral_lento_s is not None and r.tiempo_s > umbral_lento_s:
            break
    return medidas, None, salida


def _fase_rendimiento(trabajo: Trabajo, cfg: dict, directorio: str, ctx: Contexto, candado: CandadoRendimiento,
                      retro: list[Retro]) -> dict:
    entrada = cfg.get("entrada_rendimiento")
    caps = ctx.caps()
    nucleos = int(caps.get("nucleos", 1))
    if not entrada:
        return {"medido": False, "evaluable": False, "motivo": "El laboratorio no define una entrada de rendimiento."}
    if trabajo.modelo == "cuda":
        hilos = [1]
    else:
        hilos = sorted({1, *(int(p) for p in cfg["hilos_rendimiento"] if 1 <= int(p) <= nucleos)})
        if len(hilos) < 2:
            retro.append(Retro("info", "RENDIMIENTO_NO_EVALUABLE", f"El nodo trabajador tiene {nucleos} núcleo disponible: "
                               "la aceleración no se puede medir y el puntaje se basa solo en la corrección."))
            return {"medido": False, "evaluable": False, "nucleos": nucleos,
                    "motivo": "El nodo trabajador no tiene suficientes núcleos para medir la aceleración."}
    repeticiones = max(1, int(cfg["repeticiones_rendimiento"]))
    binario_ref, info_ref = _binario_referencia(trabajo, cfg, ctx, candado)
    if not binario_ref:
        return {"medido": False, "evaluable": False, "motivo": "No se pudo compilar la solución de referencia del laboratorio.",
                "compilacion_referencia": info_ref}
    binario = os.path.join(directorio, "programa")
    with candado.exclusivo():
        medidas_ref, fallo_ref, salida_ref = _medir("secuencial", binario_ref, directorio, entrada, 1, repeticiones, cfg, ctx)
        if fallo_ref is not None:
            return {"medido": False, "evaluable": False, "motivo": "La solución de referencia falló con la entrada de rendimiento."}
        puntos_crudos: list[tuple[int, list[dict]]] = []
        umbral = 3.0 * min(m["externo"] for m in medidas_ref) + 1.0
        for p in hilos:
            medidas, fallo, salida = _medir(trabajo.modelo, binario, directorio, entrada, p, repeticiones, cfg, ctx, umbral)
            if fallo is not None:
                causa = "excedió el tiempo límite" if fallo.tiempo_agotado else "terminó con error"
                retro.append(Retro("error", "RENDIMIENTO_INCORRECTO", f"Con la entrada de rendimiento (más grande que los casos "
                                   f"de prueba) y p = {p}, el programa {causa}."))
                return {"medido": False, "evaluable": True, "incorrecto": True, "motivo": f"Fallo con p = {p}: {causa}."}
            comp = comparar(salida_ref, salida, cfg["comparacion"], float(cfg["tolerancia_rel"]), float(cfg["tolerancia_abs"]))
            if not comp.ok:
                retro.append(Retro("error", "RENDIMIENTO_INCORRECTO", "Con la entrada de rendimiento (más grande que los casos "
                                   f"de prueba) y p = {p}, la salida no coincide con la de la referencia: se esperaba "
                                   f"«{comp.esperado}» y se obtuvo «{comp.obtenido}». Revisa desbordamientos de enteros y "
                                   "condiciones de carrera que solo aparecen con datos grandes."))
                return {"medido": False, "evaluable": True, "incorrecto": True,
                        "motivo": "La salida con la entrada de rendimiento es incorrecta."}
            puntos_crudos.append((p, medidas))

    usar_interno = all(m["interno"] is not None for m in medidas_ref) and all(
        m["interno"] is not None for _, medidas in puntos_crudos for m in medidas)
    clave = "interno" if usar_interno else "externo"
    t_ref = min(m[clave] for m in medidas_ref)
    t_ref = max(t_ref, 1e-6)
    tiempos = {p: max(min(m[clave] for m in medidas), 1e-6) for p, medidas in puntos_crudos}
    t_uno = tiempos.get(1)
    puntos = []
    for p, t in sorted(tiempos.items()):
        s = t_ref / t
        s_rel = (t_uno / t) if t_uno else None
        karp = None
        if p >= 2 and s_rel:
            karp = (1.0 / s_rel - 1.0 / p) / (1.0 - 1.0 / p)
        puntos.append({
            "p": p,
            "tiempo_s": round(t, 6),
            "aceleracion": round(s, 4),
            "eficiencia": round(s / p, 4) if trabajo.modelo != "cuda" else None,
            "aceleracion_relativa": round(s_rel, 4) if s_rel else None,
            "karp_flatt": round(karp, 4) if karp is not None else None,
        })
    p_max = max(tiempos)
    final = next(x for x in puntos if x["p"] == p_max)
    if trabajo.modelo == "cuda":
        objetivo = float(cfg.get("aceleracion_objetivo") or 5.0)
    else:
        objetivo = max(1.0, float(cfg["eficiencia_objetivo"]) * p_max)
    fraccion = puntaje.fraccion_objetivo(final["aceleracion"], objetivo)
    resultado = {
        "medido": True,
        "evaluable": True,
        "nucleos": nucleos,
        "fuente_tiempo": clave,
        "repeticiones": repeticiones,
        "t_referencia_s": round(t_ref, 6),
        "puntos": puntos,
        "p_max": p_max,
        "aceleracion_max": final["aceleracion"],
        "eficiencia_pmax": final["eficiencia"],
        "objetivo_aceleracion": round(objetivo, 3),
        "eficiencia_objetivo": None if trabajo.modelo == "cuda" else float(cfg["eficiencia_objetivo"]),
        "fraccion_objetivo": round(fraccion, 4),
    }
    retro.extend(_retro_rendimiento(trabajo, cfg, resultado, t_uno))
    return resultado


def _retro_rendimiento(trabajo: Trabajo, cfg: dict, r: dict, t_uno: float | None) -> list[Retro]:
    salida: list[Retro] = []
    s, p, objetivo = r["aceleracion_max"], r["p_max"], r["objetivo_aceleracion"]
    unidad = NOMBRES_P.get(trabajo.modelo, "hilos")
    sugerencias = list(cfg.get("pistas_rendimiento") or []) + SUGERENCIAS_RENDIMIENTO.get(trabajo.modelo, [])
    lista = " ".join(f"• {x}" for x in sugerencias[:4])
    final = next(x for x in r["puntos"] if x["p"] == p)
    if trabajo.modelo == "cuda":
        if s < 1:
            salida.append(Retro("advertencia", "RENDIMIENTO_LENTO", f"La versión en GPU es más lenta que la secuencial en CPU "
                                f"(S = {_n(s, 2)}). Cuando la aritmética por dato es baja, las transferencias dominan. {lista}"))
        elif s < objetivo:
            salida.append(Retro("sugerencia", "RENDIMIENTO_BAJO", f"Aceleración frente a la CPU: S = {_n(s, 2)} (objetivo "
                                f"{_n(objetivo, 1)}). {lista}"))
        else:
            salida.append(Retro("logro", "RENDIMIENTO_BUENO", f"La GPU superó el objetivo: S = {_n(s, 1)} frente a la "
                                "versión secuencial en CPU."))
        return salida
    e = final["eficiencia"] or 0.0
    karp = final.get("karp_flatt")
    texto_karp = (f" La fracción serial estimada con la métrica de Karp–Flatt es {_n(karp, 2)}." if karp is not None else "")
    if s < 1:
        salida.append(Retro("advertencia", "RENDIMIENTO_LENTO", f"Con p = {p} {unidad} la aceleración es {_n(s, 2)}: tu programa "
                            f"tarda {_n(final['tiempo_s'], 3)} s y la versión secuencial {_n(r['t_referencia_s'], 3)} s.{texto_karp} {lista}"))
    elif s < objetivo:
        salida.append(Retro("sugerencia", "RENDIMIENTO_BAJO", f"Con p = {p} {unidad} obtuviste S = {_n(s, 2)} y E = {_n(e, 2)}; "
                            f"el objetivo es E ≥ {_n(r['eficiencia_objetivo'], 2)} (S ≥ {_n(objetivo, 2)}).{texto_karp} {lista}"))
    else:
        salida.append(Retro("logro", "RENDIMIENTO_BUENO", f"Con p = {p} {unidad}, S = {_n(s, 2)} y E = {_n(e, 2)}: alcanzaste el objetivo de eficiencia."))
    if t_uno and t_uno > 1.5 * r["t_referencia_s"]:
        salida.append(Retro("sugerencia", "SOBRECARGA_UN_HILO", f"Con p = 1 tu programa tarda {_n(t_uno / r['t_referencia_s'], 1)} "
                            "veces lo que la versión secuencial: hay sobrecarga de paralelización (regiones paralelas "
                            "dentro de bucles, sincronización excesiva o un algoritmo distinto)."))
    return salida


def _modelo_disponible(modelo: str, ctx: Contexto) -> tuple[bool, str]:
    caps = ctx.caps()
    info = caps.get(modelo, {})
    if info.get("disponible"):
        return True, info.get("detalle", "")
    nombres = {"openmp": "OpenMP (gcc con -fopenmp)", "mpi": "MPI (mpicc y mpirun)", "cuda": "CUDA (nvcc y una GPU NVIDIA)"}
    return False, (f"Los recursos locales de este nodo no tienen {nombres.get(modelo, modelo)}: {info.get('detalle', '')}. "
                   "El envío quedó registrado; el docente o el administrador deben habilitar un trabajador con este modelo.")


# --------------------------------------------------------------------------------------------
# Tipos de trabajo
# --------------------------------------------------------------------------------------------
def _evaluar(trabajo: Trabajo, cfg: dict, ctx: Contexto, candado: CandadoRendimiento) -> dict:
    retro: list[Retro] = []
    requisitos, retro_req = verificar_requisitos(trabajo.codigo, cfg.get("requisitos", []), cfg.get("prohibidos", []))
    retro.extend(retro_req)
    retro.extend(analizar(trabajo.modelo, trabajo.codigo))
    requisitos_ok = all(r["cumplido"] for r in requisitos)
    resultado: dict = {"tipo": "evaluacion", "modelo": trabajo.modelo, "requisitos": requisitos}

    disponible, detalle = _modelo_disponible(trabajo.modelo, ctx)
    if not disponible:
        retro.append(Retro("info", "MODELO_NO_DISPONIBLE", detalle))
        resultado.update(veredicto="no_disponible", retroalimentacion=[x.como_dict() for x in retro], puntaje=None)
        return resultado

    directorio = _preparar_directorio(ctx)
    try:
        with candado.compartido():
            compilacion = compilar(trabajo.modelo, trabajo.lenguaje, trabajo.codigo, directorio, ctx, cfg.get("flags_compilacion"))
        resultado["compilacion"] = compilacion
        if not compilacion["ok"]:
            errores = [d for d in compilacion["diagnosticos"] if d["tipo"] == "error"]
            primero = errores[0] if errores else None
            mensaje = "El código no compila."
            if primero:
                mensaje += f" Primer error (línea {primero['linea']}): {primero['mensaje']}"
                if primero.get("explicacion"):
                    mensaje += f" → {primero['explicacion']}"
            retro.insert(0, Retro("error", "COMPILACION", mensaje, linea=primero["linea"] if primero else None))
            resultado.update(veredicto="error_compilacion", retroalimentacion=[x.como_dict() for x in retro],
                             puntaje=puntaje.calcular(0.0, None, cfg, requisitos_ok) | {"total": 0.0})
            return resultado
        advertencias = [d for d in compilacion["diagnosticos"] if d["tipo"] == "advertencia" and d.get("explicacion")]
        if advertencias:
            texto = " ".join(f"Línea {d['linea']}: {d['explicacion']}" for d in advertencias[:3])
            retro.append(Retro("sugerencia", "ADVERTENCIA_COMPILADOR", texto, linea=advertencias[0]["linea"]))

        casos = _fase_correccion(trabajo, cfg, directorio, ctx, candado)
        retro.extend(_diagnostico_dinamico(trabajo, casos))
        peso_total = sum(c["peso"] for c in casos) or 1.0
        proporcion = sum(c["peso"] for c in casos if c["aprobado"]) / peso_total
        rendimiento: dict | None = None
        if proporcion >= 1.0:
            rendimiento = _fase_rendimiento(trabajo, cfg, directorio, ctx, candado, retro)
            if rendimiento.get("incorrecto"):
                proporcion = min(proporcion, 0.99)
        else:
            rendimiento = {"medido": False, "evaluable": bool(cfg.get("entrada_rendimiento")),
                           "motivo": "El rendimiento se mide solo cuando todos los casos de prueba son correctos."}

        veredictos = {c["veredicto"] for c in casos if not c["aprobado"]}
        if "RE" in veredictos:
            veredicto = "error_ejecucion"
        elif "TLE" in veredictos:
            veredicto = "tiempo_excedido"
        elif veredictos or (rendimiento and rendimiento.get("incorrecto")):
            veredicto = "respuesta_incorrecta"
        elif not requisitos_ok:
            veredicto = "requisitos_incumplidos"
        else:
            veredicto = "aceptado"
            retro.append(Retro("logro", "TODO_CORRECTO", f"Superaste los {len(casos)} casos de prueba con todos los valores de p."))

        for c in casos:  # no se serializa el objeto del proceso
            if c.get("detalle"):
                c["detalle"].pop("_proceso", None)
        resultado.update(
            veredicto=veredicto,
            correccion={"casos": casos, "proporcion": round(proporcion, 4)},
            rendimiento=rendimiento,
            puntaje=puntaje.calcular(proporcion, rendimiento, cfg, requisitos_ok),
            retroalimentacion=[x.como_dict() for x in _ordenar(retro)],
        )
        return resultado
    finally:
        shutil.rmtree(directorio, ignore_errors=True)


def _ordenar(retro: list[Retro]) -> list[Retro]:
    prioridad = {"error": 0, "advertencia": 1, "sugerencia": 2, "info": 3, "logro": 4}
    return sorted(retro, key=lambda r: prioridad.get(r.nivel, 5))


def _ejecucion_rapida(trabajo: Trabajo, cfg: dict, ctx: Contexto, candado: CandadoRendimiento) -> dict:
    retro = analizar(trabajo.modelo, trabajo.codigo)
    p = 1 if trabajo.modelo == "cuda" else max(1, min(int(trabajo.hilos or 1), ctx.max_hilos_ejecucion))
    entrada = trabajo.entrada
    caso_ref = None
    if entrada is None:
        caso_ref = next((c for c in trabajo.casos if c.get("visible")), None)
        entrada = caso_ref.get("entrada", "") if caso_ref else ""
    else:
        caso_ref = next((c for c in trabajo.casos if c.get("visible") and c.get("entrada", "").strip() == entrada.strip()), None)
    resultado: dict = {"tipo": "ejecucion", "modelo": trabajo.modelo, "p": p, "entrada": _extracto(entrada, 4000)}
    disponible, detalle = _modelo_disponible(trabajo.modelo, ctx)
    if not disponible:
        retro.append(Retro("info", "MODELO_NO_DISPONIBLE", detalle))
        resultado.update(veredicto="no_disponible", retroalimentacion=[x.como_dict() for x in retro])
        return resultado
    directorio = _preparar_directorio(ctx)
    try:
        with candado.compartido():
            compilacion = compilar(trabajo.modelo, trabajo.lenguaje, trabajo.codigo, directorio, ctx, cfg.get("flags_compilacion"))
        resultado["compilacion"] = compilacion
        if not compilacion["ok"]:
            resultado.update(veredicto="error_compilacion", retroalimentacion=[x.como_dict() for x in retro])
            return resultado
        with candado.compartido():
            r = ejecutar_programa(trabajo.modelo, os.path.join(directorio, "programa"), directorio, entrada, p, cfg, ctx,
                                  float(cfg["tiempo_limite_s"]))
        veredicto = {"TLE": "tiempo_excedido", "RE": "error_ejecucion"}.get(_veredicto_proceso(r), "ejecutado")
        if veredicto == "error_ejecucion":
            retro.append(retro_error_ejecucion(r, trabajo.modelo))
        resultado.update(
            veredicto=veredicto,
            stdout=_extracto(r.stdout, 20000),
            stderr=_extracto(limpiar_rutas(r.stderr, directorio), 8000),
            tiempo_s=round(r.tiempo_s, 4),
            tiempo_interno_s=_tiempo_interno(r.stderr),
            codigo_salida=r.codigo_salida,
            senal=r.senal,
        )
        if caso_ref is not None and veredicto == "ejecutado":
            comp = comparar(caso_ref.get("salida_esperada", ""), r.stdout, cfg["comparacion"],
                            float(cfg["tolerancia_rel"]), float(cfg["tolerancia_abs"]))
            resultado["comparacion_ejemplo"] = {"caso": caso_ref.get("nombre"), **comp.como_dict()}
        resultado["retroalimentacion"] = [x.como_dict() for x in _ordenar(retro)]
        return resultado
    finally:
        shutil.rmtree(directorio, ignore_errors=True)


def _ejecucion_referencia(trabajo: Trabajo, cfg: dict, ctx: Contexto, candado: CandadoRendimiento) -> dict:
    directorio = _preparar_directorio(ctx)
    try:
        with candado.compartido():
            compilacion = compilar("secuencial", "c", trabajo.referencia, directorio, ctx, cfg.get("flags_referencia"), "referencia")
        resultado: dict = {"tipo": "referencia", "compilacion": compilacion}
        if not compilacion["ok"]:
            resultado["veredicto"] = "error_compilacion"
            return resultado
        binario = os.path.join(directorio, "referencia")
        limite = max(float(cfg["tiempo_limite_s"]), 30.0)
        casos = []
        for caso in trabajo.casos:
            with candado.compartido():
                r = ejecutar_programa("secuencial", binario, directorio, caso.get("entrada", ""), 1, cfg, ctx, limite)
            casos.append({
                "id": caso.get("id"),
                "nombre": caso.get("nombre"),
                "ok": r.exito,
                "salida": r.stdout if r.exito else "",
                "error": None if r.exito else _extracto(r.stderr or f"código {r.codigo_salida}, señal {r.senal}", 1000),
                "tiempo_s": round(r.tiempo_s, 4),
            })
        resultado["casos"] = casos
        if cfg.get("entrada_rendimiento"):
            with candado.exclusivo():
                r = ejecutar_programa("secuencial", binario, directorio, cfg["entrada_rendimiento"], 1, cfg, ctx,
                                      float(cfg["tiempo_limite_rendimiento_s"]))
            resultado["rendimiento"] = {"ok": r.exito, "tiempo_s": round(r.tiempo_s, 4), "tiempo_interno_s": _tiempo_interno(r.stderr),
                                        "salida": _extracto(r.stdout, 2000)}
        resultado["veredicto"] = "completado" if all(c["ok"] for c in casos) else "error_ejecucion"
        return resultado
    finally:
        shutil.rmtree(directorio, ignore_errors=True)


def procesar(trabajo: Trabajo, ctx: Contexto) -> dict:
    inicio = time.perf_counter()
    cfg = configuracion_efectiva(trabajo.config)
    candado = CandadoRendimiento(os.path.join(ctx.directorio_cache, "candados"))
    try:
        if trabajo.tipo == "ejecucion":
            resultado = _ejecucion_rapida(trabajo, cfg, ctx, candado)
        elif trabajo.tipo == "referencia":
            resultado = _ejecucion_referencia(trabajo, cfg, ctx, candado)
        else:
            resultado = _evaluar(trabajo, cfg, ctx, candado)
    except Exception as exc:  # pragma: no cover - errores inesperados del motor
        resultado = {"tipo": trabajo.tipo, "veredicto": "error_interno",
                     "retroalimentacion": [Retro("error", "ERROR_INTERNO", f"Error interno del motor: {exc!r}",
                                                 titulo="Error interno del motor").como_dict()]}
    resultado["duracion_s"] = round(time.perf_counter() - inicio, 3)
    resultado["nodo"] = ctx.nombre_nodo
    resultado["version_motor"] = 1
    return resultado
