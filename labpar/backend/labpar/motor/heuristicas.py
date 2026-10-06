"""Análisis estático ligero para retroalimentación temprana (antes de compilar).

Son heurísticas: señalan patrones frecuentes en estudiantes (condiciones de carrera, falta de
sincronización, impresión desde todos los procesos, etc.). Por eso se presentan como advertencias o
sugerencias y nunca restan puntaje por sí mismas.
"""
from __future__ import annotations

import re

from .codigo import bloque_balanceado, limpiar_codigo, linea_de
from .retro import Retro

_TIPOS_C = r"(?:const\s+)?(?:unsigned\s+|signed\s+)?(?:long\s+long|long\s+double|long|int|short|char|float|double|size_t|u?int\d+_t|bool|auto)"
_DECLARACION = re.compile(rf"\b{_TIPOS_C}\s+\**\s*(\w+)")
_ACTUALIZACION = re.compile(r"(?<![\w\].>])(\w+)\s*(?:\+=|-=|\*=|/=|\|=|&=|\^=|\+\+|--)|(?:\+\+|--)\s*(\w+)\b(?!\s*\[)")
_AUTOASIGNACION = re.compile(r"(?<![\w\].>])(\w+)\s*=\s*\1\b\s*[-+*/|&^]")
_PRAGMA_OMP = re.compile(r"#\s*pragma\s+omp\b((?:[^\n\\]|\\\n)*)")


def _variables_de_clausulas(clausulas: str) -> set[str]:
    variables: set[str] = set()
    for m in re.finditer(r"\b(?:private|firstprivate|lastprivate|linear|reduction\s*\([^:)]*:)\s*\(?([^)]*)\)", clausulas):
        variables.update(v.strip() for v in m.group(1).split(",") if v.strip())
    for m in re.finditer(r"reduction\s*\(\s*[^:]+:\s*([^)]*)\)", clausulas):
        variables.update(v.strip() for v in m.group(1).split(",") if v.strip())
    return {re.sub(r"\[.*", "", v) for v in variables}


def heuristicas_openmp(codigo: str) -> list[Retro]:
    retro: list[Retro] = []
    limpio = limpiar_codigo(codigo)
    sin_comentarios = limpiar_codigo(codigo, quitar_cadenas=False)

    llamada = re.search(r"\bomp_\w+\s*\(", limpio)
    if llamada and not re.search(r"#\s*include\s*<omp\.h>", sin_comentarios):
        retro.append(Retro("error", "OMP_SIN_INCLUDE", "Usas funciones de OpenMP (por ejemplo, omp_get_wtime) sin "
                           "incluir el encabezado. Agrega #include <omp.h>.", linea=linea_de(limpio, llamada.start())))

    pragmas = list(_PRAGMA_OMP.finditer(limpio))
    if not pragmas:
        retro.append(Retro("advertencia", "OMP_SIN_DIRECTIVAS", "No se encontró ninguna directiva «#pragma omp»: el "
                           "programa se ejecutará de forma secuencial aunque se le asignen varios hilos."))

    fijo = re.search(r"\bomp_set_num_threads\s*\(\s*\d+\s*\)|\bnum_threads\s*\(\s*\d+\s*\)", limpio)
    if fijo:
        retro.append(Retro("sugerencia", "OMP_HILOS_FIJOS", "Evita fijar el número de hilos con una constante: la "
                           "plataforma lo controla con la variable OMP_NUM_THREADS para medir la aceleración con "
                           "distintos valores de p.", linea=linea_de(limpio, fijo.start())))

    reportadas: set[str] = set()
    for pragma in pragmas:
        clausulas = pragma.group(1).replace("\\\n", " ")
        if not re.match(r"\s*(?:parallel\s+)?for\b", clausulas):
            continue
        fin_linea = limpio.find("\n", pragma.end())
        if fin_linea == -1:
            continue
        cabecera = re.match(r"\s*for\s*\(\s*(?:\w+\s+)*?(\w+)\s*=", limpio[fin_linea + 1:])
        rango = bloque_balanceado(limpio, fin_linea + 1)
        if not rango:
            continue
        cuerpo = limpio[rango[0]:rango[1]]
        excluidas = _variables_de_clausulas(clausulas) | set(_DECLARACION.findall(cuerpo))
        if cabecera:
            excluidas.add(cabecera.group(1))
        # Variables de control de bucles internos
        excluidas.update(re.findall(r"\bfor\s*\(\s*(?:\w+\s+)*?(\w+)\s*=", cuerpo))
        sincronizado = re.search(r"#\s*pragma\s+omp\s+(?:atomic|critical)", cuerpo)
        if sincronizado and "reduction" not in clausulas and re.search(r"#\s*pragma\s+omp\s+critical", cuerpo):
            retro.append(Retro("sugerencia", "OMP_CRITICA_EN_BUCLE", "Hay una sección «critical» dentro del bucle "
                               "paralelo: serializa cada iteración. Si acumulas un valor, la cláusula reduction es "
                               "mucho más eficiente.", linea=linea_de(limpio, rango[0] + sincronizado.start())))
            continue
        if sincronizado:
            continue
        candidatos = [(m.start(), m.group(1) or m.group(2)) for m in _ACTUALIZACION.finditer(cuerpo)]
        candidatos += [(m.start(), m.group(1)) for m in _AUTOASIGNACION.finditer(cuerpo)]
        for inicio, variable in sorted(candidatos):
            if not variable or variable in excluidas or variable in reportadas or variable[0].isdigit():
                continue
            reportadas.add(variable)
            retro.append(Retro("advertencia", "OMP_CARRERA_ESTATICA",
                               f"La variable «{variable}» se modifica dentro de un bucle paralelo sin reduction, "
                               "atomic ni critical. Si es compartida, varios hilos la actualizan a la vez (condición "
                               f"de carrera). Considera reduction(+:{variable}) o declararla privada.",
                               linea=linea_de(limpio, rango[0] + inicio)))
    return retro


def heuristicas_mpi(codigo: str) -> list[Retro]:
    retro: list[Retro] = []
    limpio = limpiar_codigo(codigo)
    sin_comentarios = limpiar_codigo(codigo, quitar_cadenas=False)
    usa_mpi = re.search(r"\bMPI_\w+\s*\(", limpio)
    if usa_mpi and not re.search(r"#\s*include\s*<mpi\.h>", sin_comentarios):
        retro.append(Retro("error", "MPI_SIN_INCLUDE", "Usas funciones de MPI sin incluir el encabezado. Agrega "
                           "#include <mpi.h>.", linea=linea_de(limpio, usa_mpi.start())))
    if not re.search(r"\bMPI_Init(?:_thread)?\s*\(", limpio):
        retro.append(Retro("advertencia", "MPI_SIN_INIT", "No se encontró MPI_Init: toda llamada MPI debe ocurrir "
                           "después de inicializar el entorno."))
    if not re.search(r"\bMPI_Finalize\s*\(", limpio):
        retro.append(Retro("advertencia", "MPI_SIN_FINALIZE", "No se encontró MPI_Finalize: cada proceso debe "
                           "finalizar el entorno MPI antes de terminar."))
    rango = re.search(r"\bMPI_Comm_rank\s*\(\s*\w+\s*,\s*&\s*(\w+)\s*\)", limpio)
    impresion = re.search(r"\b(?:printf|puts|cout)\b", limpio)
    if rango and impresion:
        r = re.escape(rango.group(1))
        protegido = re.search(rf"\b{r}\s*==\s*0|\b0\s*==\s*{r}\b|!\s*{r}\b|\b{r}\s*!=\s*0|\b{r}\s*>\s*0|\b{r}\s*\)\s*\{{?\s*(?:return|continue)", limpio)
        if not protegido:
            retro.append(Retro("advertencia", "MPI_IMPRESION_TODOS", f"Todos los procesos ejecutan la impresión: "
                               f"normalmente solo el proceso 0 debe imprimir el resultado (if ({rango.group(1)} == 0)).",
                               linea=linea_de(limpio, impresion.start())))
    return retro


def heuristicas_cuda(codigo: str) -> list[Retro]:
    retro: list[Retro] = []
    limpio = limpiar_codigo(codigo)
    lanzamiento = re.search(r"<<<", limpio)
    if lanzamiento:
        posterior = limpio[lanzamiento.end():]
        if not re.search(r"\bcuda(?:DeviceSynchronize|Memcpy|MemcpyAsync|StreamSynchronize|EventSynchronize)\s*\(", posterior):
            retro.append(Retro("advertencia", "CUDA_SIN_SINCRONIZAR", "Después de lanzar el kernel no hay "
                               "cudaDeviceSynchronize ni cudaMemcpy: el host podría usar resultados que la GPU aún no "
                               "ha calculado.", linea=linea_de(limpio, lanzamiento.start())))
    for kernel in re.finditer(r"__global__\s+void\s+(\w+)\s*\([^)]*\)\s*\{", limpio):
        inicio = kernel.end() - 1
        rango = bloque_balanceado(limpio, inicio)
        cuerpo = limpio[rango[0]:rango[1]] if rango else ""
        if not re.search(r"\bif\s*\([^)]*<|\bfor\s*\([^;]*;[^;]*<|\bwhile\s*\([^)]*<|return", cuerpo):
            retro.append(Retro("advertencia", "CUDA_SIN_LIMITE", f"El kernel «{kernel.group(1)}» no parece verificar "
                               "que el índice global esté dentro del arreglo (if (i < n)). Si el número total de hilos "
                               "supera n, se accede fuera de rango.", linea=linea_de(limpio, kernel.start())))
    if "<<<" in limpio and not re.search(r"\bcuda(?:GetLastError|PeekAtLastError)\s*\(", limpio):
        retro.append(Retro("sugerencia", "CUDA_SIN_VERIFICAR_ERRORES", "Verifica los errores de lanzamiento con "
                           "cudaGetLastError() y los de ejecución con el valor de retorno de cudaDeviceSynchronize()."))
    if re.search(r"\bcudaMalloc\s*\(", limpio) and not re.search(r"\bcudaFree\s*\(", limpio):
        retro.append(Retro("sugerencia", "CUDA_SIN_LIBERAR", "Reservas memoria con cudaMalloc pero no la liberas con "
                           "cudaFree."))
    return retro


def analizar(modelo: str, codigo: str) -> list[Retro]:
    if modelo == "openmp":
        return heuristicas_openmp(codigo)
    if modelo == "mpi":
        return heuristicas_mpi(codigo)
    if modelo == "cuda":
        return heuristicas_cuda(codigo)
    return []


def verificar_requisitos(codigo: str, requisitos: list[dict], prohibidos: list[dict]) -> tuple[list[dict], list[Retro]]:
    """Comprueba patrones obligatorios y prohibidos (sobre el código sin comentarios ni cadenas)."""
    limpio = limpiar_codigo(codigo)
    estado: list[dict] = []
    retro: list[Retro] = []
    for req in requisitos or []:
        cumplido = re.search(req["patron"], limpio, re.MULTILINE) is not None
        estado.append({"mensaje": req["mensaje"], "cumplido": cumplido, "tipo": "requisito"})
        if not cumplido:
            retro.append(Retro("error", "REQUISITO", req["mensaje"]))
    for proh in prohibidos or []:
        encontrado = re.search(proh["patron"], limpio, re.MULTILINE)
        estado.append({"mensaje": proh["mensaje"], "cumplido": encontrado is None, "tipo": "prohibido"})
        if encontrado:
            retro.append(Retro("error", "PROHIBIDO", proh["mensaje"], linea=linea_de(limpio, encontrado.start())))
    return estado, retro
