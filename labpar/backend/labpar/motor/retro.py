"""Retroalimentación formativa: estructura y catálogo de códigos estables (usados en la analítica)."""
from __future__ import annotations

from dataclasses import asdict, dataclass

NIVELES = ("error", "advertencia", "sugerencia", "logro", "info")

# Código -> título corto. Los códigos son estables porque la analítica docente los agrega.
CATALOGO: dict[str, str] = {
    "COMPILACION": "Error de compilación",
    "ADVERTENCIA_COMPILADOR": "Advertencias del compilador",
    "REQUISITO": "Requisito del laboratorio no cumplido",
    "PROHIBIDO": "Construcción no permitida en este laboratorio",
    "OMP_SIN_INCLUDE": "Falta #include <omp.h>",
    "OMP_SIN_DIRECTIVAS": "El código no usa directivas OpenMP",
    "OMP_CARRERA_ESTATICA": "Posible condición de carrera",
    "OMP_CRITICA_EN_BUCLE": "Sincronización dentro del bucle paralelo",
    "OMP_HILOS_FIJOS": "Número de hilos fijado en el código",
    "MPI_SIN_INCLUDE": "Falta #include <mpi.h>",
    "MPI_SIN_INIT": "Falta MPI_Init",
    "MPI_SIN_FINALIZE": "Falta MPI_Finalize",
    "MPI_IMPRESION_TODOS": "Todos los procesos imprimen",
    "CUDA_SIN_SINCRONIZAR": "Lanzamiento de kernel sin sincronización",
    "CUDA_SIN_LIMITE": "Kernel sin verificación de límites",
    "CUDA_SIN_VERIFICAR_ERRORES": "No se verifican errores de CUDA",
    "CUDA_SIN_LIBERAR": "Memoria de la GPU sin liberar",
    "CARRERA_PROBABLE": "Resultado incorrecto solo en paralelo",
    "NO_DETERMINISMO": "Resultados distintos entre ejecuciones",
    "REPARTO_INCORRECTO": "Reparto de trabajo o comunicación incorrectos",
    "INTERBLOQUEO": "Posible interbloqueo (deadlock)",
    "ESPERA_INFINITA": "El programa no termina en paralelo",
    "ERROR_LOGICO": "Resultado incorrecto también con un hilo",
    "TIEMPO_EXCEDIDO": "Tiempo límite excedido",
    "SEGFAULT": "Violación de segmento",
    "DIV_CERO": "Excepción aritmética",
    "ABORTO": "El programa abortó",
    "MEMORIA": "Límite de memoria o proceso terminado",
    "SALIDA_EXCESIVA": "Salida demasiado grande",
    "CODIGO_SALIDA": "Código de salida distinto de cero",
    "CUDA_ERROR_EJECUCION": "Error de CUDA en tiempo de ejecución",
    "RENDIMIENTO_LENTO": "La versión paralela es más lenta que la secuencial",
    "RENDIMIENTO_BAJO": "Eficiencia por debajo del objetivo",
    "RENDIMIENTO_BUENO": "Buen escalamiento",
    "SOBRECARGA_UN_HILO": "Sobrecarga de paralelización",
    "RENDIMIENTO_NO_EVALUABLE": "Rendimiento no evaluable en este nodo",
    "RENDIMIENTO_INCORRECTO": "Salida incorrecta en la entrada de rendimiento",
    "TODO_CORRECTO": "Todos los casos de prueba superados",
    "MODELO_NO_DISPONIBLE": "Modelo no disponible en los recursos locales",
}


@dataclass
class Retro:
    nivel: str
    codigo: str
    mensaje: str
    titulo: str | None = None
    linea: int | None = None

    def __post_init__(self) -> None:
        if self.titulo is None:
            self.titulo = CATALOGO.get(self.codigo, self.codigo.replace("_", " ").capitalize())

    def como_dict(self) -> dict:
        return asdict(self)
