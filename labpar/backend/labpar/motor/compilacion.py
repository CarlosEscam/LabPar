"""Comandos de compilación por modelo de programación y análisis de diagnósticos del compilador."""
from __future__ import annotations

import re

NOMBRES_FUENTE = {"c": "programa.c", "cpp": "programa.cpp", "cuda": "programa.cu"}

_Q = "[‘’'`\"]"  # comillas tipográficas o ASCII usadas por GCC/Clang/NVCC

# Orden: de lo más específico a lo más general.
_EXPLICACIONES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(rf"implicit declaration of function {_Q}?(omp_\w+)"),
     "La función «{0}» pertenece a OpenMP: agrega #include <omp.h> al inicio del archivo."),
    (re.compile(rf"implicit declaration of function {_Q}?(MPI_\w+)"),
     "La función «{0}» pertenece a MPI: agrega #include <mpi.h> al inicio del archivo."),
    (re.compile(rf"implicit declaration of function {_Q}?(\w+)"),
     "Se llama a «{0}» sin haberla declarado: revisa la ortografía o incluye el encabezado que la define."),
    (re.compile(rf"{_Q}(\w+){_Q} undeclared|{_Q}(\w+){_Q} was not declared in this scope|identifier \"(\w+)\" is undefined"),
     "«{0}» no está declarada en este punto. Si la declaraste dentro de un bloque (por ejemplo, dentro de la región "
     "paralela o de un if), solo existe dentro de ese bloque."),
    (re.compile(rf"expected (?:{_Q},{_Q} or )?{_Q};{_Q}"), "Falta un punto y coma (;) al final de la instrucción anterior."),
    (re.compile(rf"expected {_Q}\){_Q}|expected {_Q}\({_Q}"), "Falta un paréntesis: revisa que cada «(» tenga su «)»."),
    (re.compile(r"expected declaration or statement at end of input"),
     "Falta cerrar una llave «}»: revisa que cada bloque abierto tenga su cierre."),
    (re.compile(rf"undefined reference to {_Q}main"), "El programa debe definir la función main."),
    (re.compile(rf"undefined reference to {_Q}(\w+)"),
     "El enlazador no encuentra «{0}»: puede estar mal escrita o no estar definida en ningún archivo."),
    (re.compile(rf"reduction variable {_Q}(\w+){_Q} is private in outer context"),
     "La variable de reducción «{0}» es privada en la región exterior: declárala fuera de la región paralela "
     "para que sea compartida."),
    (re.compile(rf"{_Q}(\w+){_Q} not specified in enclosing {_Q}parallel"),
     "Con default(none) debes declarar explícitamente el alcance de «{0}» (shared, private, firstprivate o reduction)."),
    (re.compile(r"invalid controlling predicate|invalid increment expression|invalid type for iteration variable"),
     "El bucle asociado a «#pragma omp for» debe tener forma canónica: for (i = inicio; i < fin; i++), "
     "sin modificar la variable de control dentro del cuerpo."),
    (re.compile(rf"{_Q}(\w+){_Q} (?:is|may be) used uninitialized"),
     "«{0}» se usa sin inicializar; en un programa paralelo esto produce resultados impredecibles."),
    (re.compile(rf"unused variable {_Q}(\w+)"), "La variable «{0}» se declara pero no se usa."),
    (re.compile(rf"format {_Q}%(\w+){_Q} expects argument of type {_Q}([^‘’'`\"]+)"),
     "El especificador %{0} de printf/scanf espera un argumento de tipo «{1}»: usa %lld para long long, "
     "%lf para leer double y %d para int."),
    (re.compile(rf"too few arguments to function {_Q}?(\w+)"), "Faltan argumentos en la llamada a «{0}»: revisa su firma."),
    (re.compile(rf"too many arguments to function {_Q}?(\w+)"), "Sobran argumentos en la llamada a «{0}»: revisa su firma."),
    (re.compile(r"incompatible (?:pointer )?type|makes pointer from integer|makes integer from pointer"),
     "Tipos incompatibles: revisa los argumentos (por ejemplo, que pases &variable a MPI_Recv o scanf y que el "
     "MPI_Datatype coincida con el tipo en C)."),
    (re.compile(r"a __global__ function call must be configured"),
     "Para lanzar un kernel indica la configuración de ejecución: nombre<<<bloques, hilosPorBloque>>>(...)."),
    (re.compile(r"calling a __host__ function.*from a __global__ function"),
     "Desde un kernel solo puedes llamar funciones __device__ (o __host__ __device__)."),
    (re.compile(r"No such file or directory"), "No se encuentra un archivo incluido: verifica el nombre del encabezado."),
    (re.compile(r"control reaches end of non-void function"),
     "La función puede terminar sin ejecutar return: agrega el valor de retorno en todos los caminos."),
]

_DIAG_GCC = re.compile(
    r"^(?P<archivo>[^:\n]*?):(?P<linea>\d+):(?:(?P<columna>\d+):)?\s*(?P<tipo>fatal error|error|warning)[^:]*:\s*(?P<mensaje>.*)$",
    re.MULTILINE,
)
_DIAG_NVCC = re.compile(
    r"^(?P<archivo>[^(\n]+)\((?P<linea>\d+)\):\s*(?P<tipo>error|warning)[^:]*:\s*(?P<mensaje>.*)$", re.MULTILINE
)
_DIAG_ENLAZADOR = re.compile(r"^.*(?P<mensaje>undefined reference to .*)$", re.MULTILINE)


def nombre_fuente(lenguaje: str) -> str:
    return NOMBRES_FUENTE.get(lenguaje, "programa.c")


def comando_compilacion(modelo: str, lenguaje: str, fuente: str, salida: str, flags_extra: list[str] | None = None) -> list[str]:
    extra = list(flags_extra or [])
    es_cpp = lenguaje == "cpp"
    norma = ["-std=gnu++17"] if es_cpp else ["-std=gnu11"]
    if modelo == "secuencial":
        return [("g++" if es_cpp else "gcc"), "-O2", *norma, "-o", salida, fuente, *extra, "-lm"]
    if modelo == "openmp":
        return [("g++" if es_cpp else "gcc"), "-O2", "-fopenmp", "-Wall", *norma, "-o", salida, fuente, *extra, "-lm"]
    if modelo == "mpi":
        return [("mpicxx" if es_cpp else "mpicc"), "-O2", "-Wall", *norma, "-o", salida, fuente, *extra, "-lm"]
    if modelo == "cuda":
        return ["nvcc", "-O2", "-std=c++17", "-o", salida, fuente, *extra]
    raise ValueError(f"Modelo de programación desconocido: {modelo}")


def explicar(mensaje: str) -> str | None:
    for patron, plantilla in _EXPLICACIONES:
        coincidencia = patron.search(mensaje)
        if coincidencia:
            grupos = [g for g in coincidencia.groups() if g is not None]
            try:
                return plantilla.format(*grupos)
            except IndexError:
                return plantilla
    return None


def limpiar_rutas(texto: str, directorio: str) -> str:
    return texto.replace(directorio.rstrip("/") + "/", "").replace(directorio, ".")


def analizar_diagnosticos(salida: str, maximo: int = 40) -> list[dict]:
    diagnosticos: list[dict] = []
    vistos: set[tuple] = set()
    for patron in (_DIAG_GCC, _DIAG_NVCC):
        for m in patron.finditer(salida):
            tipo = "error" if "error" in m.group("tipo") else "advertencia"
            mensaje = m.group("mensaje").strip()
            clave = (int(m.group("linea")), mensaje)
            if clave in vistos:
                continue
            vistos.add(clave)
            columna = m.groupdict().get("columna")
            diagnosticos.append(
                {
                    "linea": int(m.group("linea")),
                    "columna": int(columna) if columna else None,
                    "tipo": tipo,
                    "mensaje": mensaje,
                    "explicacion": explicar(mensaje),
                }
            )
    for m in _DIAG_ENLAZADOR.finditer(salida):
        mensaje = m.group("mensaje").strip()
        if (0, mensaje) in vistos:
            continue
        vistos.add((0, mensaje))
        diagnosticos.append({"linea": None, "columna": None, "tipo": "error", "mensaje": mensaje, "explicacion": explicar(mensaje)})
    # Primero errores con línea (los más accionables), luego errores del enlazador y al final advertencias.
    diagnosticos.sort(key=lambda d: (d["tipo"] != "error", d["linea"] is None, d["linea"] or 0))
    return diagnosticos[:maximo]
