# Guía para crear laboratorios

Un laboratorio de LabPar reúne un enunciado, una plantilla para el estudiante, una **solución de referencia secuencial**, una solución del docente, casos de prueba y una configuración de evaluación. Hay dos formas de crearlo:

- **En la plataforma** (Banco de laboratorios > Crear laboratorio, o Duplicar a partir de uno existente). Es lo recomendable para los docentes.
- **Como carpeta del banco institucional** en `backend/labpar/banco/<identificador>/`. La API sincroniza el banco al iniciar y versiona cada laboratorio por su contenido. Los docentes adaptan los laboratorios del banco duplicándolos. Si el administrador edita uno en la web, ese laboratorio deja de sincronizarse para no perder sus cambios.

## 1. Lista de verificación

1. Defina **objetivos de aprendizaje** con verbos observables y su nivel en la taxonomía de Bloom: Recordar, Comprender, Aplicar, Analizar, Evaluar o Crear.
2. Escriba el **enunciado** con el formato exacto de la entrada y de la salida. La comparación es automática.
3. Prepare la **plantilla**: el código que recibe el estudiante, con un `TODO` donde debe paralelizar y la medición de tiempo ya incluida.
4. Escriba la **referencia secuencial** en C. Define las salidas esperadas y el tiempo base de la aceleración.
5. Cree los **casos de prueba**: al menos uno visible como ejemplo y varios ocultos que cubran los bordes.
6. Pulse **Generar salidas con la referencia** y luego **Evaluar la solución del docente**. Debe obtener 100 puntos.
7. Pruebe la **plantilla sin modificar**. Debe compilar y, si hay requisitos, recibir «Requisitos incumplidos».
8. Publique el laboratorio y asígnelo a un curso.

## 2. Convenciones del código

**Medición de tiempo.** El programa debe imprimir en la salida de errores una línea `LABPAR_TIEMPO=<segundos>` con el tiempo de la región que se paraleliza, sin contar la lectura de la entrada ni la impresión. La plataforma usa esa línea para calcular la aceleración; si falta, usa el tiempo total del proceso, que es menos preciso. Ejemplos:

```c
double t0 = omp_get_wtime();   /* OpenMP */          double t0 = MPI_Wtime();   /* MPI, imprime solo el proceso 0 */
...                                                   ...
fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", omp_get_wtime() - t0);
```

En CUDA, mida con `cudaEvent_t`, incluidas las transferencias que el estudiante deba optimizar. En la referencia secuencial, use `clock_gettime(CLOCK_MONOTONIC, …)`.

**Número de hilos o procesos.** No lo fije en el código: la plataforma lo controla con `OMP_NUM_THREADS` o con `mpirun -np p`. La heurística `OMP_HILOS_FIJOS` advierte si el estudiante llama a `omp_set_num_threads`.

**Datos de entrada grandes.** En lugar de casos de varios megabytes, lea un tamaño y una semilla y genere los datos con una función determinista que dependa solo del índice. Así, cualquier hilo o proceso puede calcular cualquier elemento sin coordinarse. Los laboratorios del banco usan un generador basado en contador:

```c
static inline unsigned long long mezclar(unsigned long long x) {        /* splitmix64 */
    x += 0x9E3779B97F4A7C15ULL;
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ULL;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBULL;
    return x ^ (x >> 31);
}
static inline long long valor(long long i, long long semilla) {
    return (long long)(mezclar((unsigned long long)i + 0x632BE59BD9B4E019ULL * (unsigned long long)semilla) % 1000ULL);
}
```

**Salida.** Imprima solo el resultado, y en MPI solo desde el proceso 0. Si el resultado es de punto flotante y el orden de la suma cambia con *p*, use la comparación numérica con una tolerancia.

## 3. Casos de prueba

| Caso | Por qué |
|---|---|
| Ejemplo del enunciado (visible) | El estudiante lo prueba en la consola antes de enviar. |
| Un elemento y cero elementos | Revelan divisiones entre cero y repartos vacíos. |
| *n* que no es divisible por *p* (por ejemplo, un primo) | Revela repartos que pierden el residuo `n % p`. |
| Tamaño grande, con más peso | Hace visibles las condiciones de carrera, que con *n* pequeño casi nunca ocurren. |

La **entrada de rendimiento** (configuración) debe ser más grande que cualquier caso y hacer que la referencia tarde entre 0,5 y 3 segundos en el nodo. Con menos tiempo, el ruido domina la medición; con más, la evaluación se alarga. Al generar las salidas, la plataforma muestra cuánto tarda la referencia con esa entrada.

## 4. Configuración de la evaluación

Los campos vacíos usan el valor por defecto del motor.

| Clave | Defecto | Descripción |
|---|---|---|
| `hilos_correccion` | `[1, 4]` | Valores de *p* con los que se ejecuta cada caso. Incluya 1 y al menos uno mayor. En MPI, conviene un valor impar, como 3. |
| `repeticiones_correccion` | 2 | Repeticiones por *p*: detectan el no determinismo. |
| `tiempo_limite_s` | 10 | Límite de reloj por ejecución. |
| `tiempo_total_correccion_s` | 120 | Presupuesto total de la fase de corrección. |
| `memoria_mb` | 512 | Memoria de los programas OpenMP y secuenciales. MPI y CUDA los limita el contenedor. |
| `comparacion` | `tokens` | `exacta` (línea por línea), `tokens` (palabras y números, sin importar los espacios) o `numerica` (con tolerancia). |
| `tolerancia_rel`, `tolerancia_abs` | 1e-9, 1e-12 | Para la comparación numérica. |
| `entrada_rendimiento` | — | Entrada grande para medir la aceleración. Si falta, solo se evalúa la corrección. |
| `hilos_rendimiento` | `[1, 2, 4, 8]` | Valores de *p* medidos. Se usan solo los que no superan los núcleos del nodo. |
| `repeticiones_rendimiento` | 3 | Se toma el mínimo. |
| `tiempo_limite_rendimiento_s` | 30 | Límite de cada ejecución de medición. |
| `eficiencia_objetivo` | 0,6 | Objetivo con el mayor *p*: *S* ≥ *E*<sub>obj</sub> · *p*. |
| `aceleracion_objetivo` | 5 (CUDA) | Objetivo absoluto frente a la CPU, para CUDA. |
| `peso_correccion`, `peso_rendimiento` | 70, 30 | Pesos del puntaje. |
| `requisitos`, `prohibidos` | `[]` | Listas de `{patron, mensaje}` con expresiones regulares que se buscan en el código sin comentarios ni cadenas. |
| `pistas_rendimiento` | `[]` | Sugerencias propias que se muestran si la aceleración no alcanza el objetivo. |
| `flags_compilacion` | `[]` | Opciones adicionales del compilador del estudiante. |

Ejemplo de requisitos para un laboratorio de comunicación punto a punto:

```yaml
requisitos:
  - patron: '\bMPI_Send\s*\('
    mensaje: Usa MPI_Send para enviar el resultado parcial al siguiente proceso del anillo.
  - patron: '\bMPI_Recv\s*\('
    mensaje: Usa MPI_Recv para recibir el resultado parcial del proceso anterior.
prohibidos:
  - patron: '\bMPI_(All)?[Rr]educe\s*\('
    mensaje: En este laboratorio la suma se combina con mensajes punto a punto, no con MPI_Reduce.
```

## 5. Carpeta del banco institucional

```
backend/labpar/banco/omp-05-mi-laboratorio/
  lab.yaml            metadatos, configuración, casos, pistas y preguntas
  enunciado.md        Markdown con fórmulas $…$ y $$…$$
  plantilla.c         (plantilla.cu para CUDA)
  referencia.c        versión secuencial en C
  solucion.c          solución del docente (solucion.cu para CUDA)
  casos/
    01-ejemplo.entrada
    01-ejemplo.salida   (se genera)
```

```yaml
slug: omp-05-mi-laboratorio
titulo: Título visible
modelo: openmp            # openmp | mpi | cuda
lenguaje: c               # c | cpp | cuda
nivel: basico             # basico | intermedio | avanzado
orden: 5
duracion_estimada_min: 45
resumen: Una o dos frases para las listas.
conceptos: [parallel for, reduction]
objetivos:
  - {nivel: Aplicar, texto: Paralelizar un bucle con parallel for y reduction.}
config:
  hilos_correccion: [1, 4]
  entrada_rendimiento: "200000000 7\n"
casos:
  - {nombre: Ejemplo del enunciado, archivo: 01-ejemplo, visible: true}
  - {nombre: Tamaño grande, archivo: 02-grande, peso: 2}
pistas:
  - Primera pista, la más general.
preguntas:
  - pregunta: ¿Qué hace la cláusula `reduction(+:s)`?
    opciones: [Opción A, Opción B, Opción C, Opción D]
    correcta: 2           # índice desde 0
    explicacion: Por qué esa es la respuesta.
```

Herramientas de línea de comandos (desde `backend/`):

```bash
python -m labpar.banco generar-salidas --slug omp-05-mi-laboratorio   # compila referencia.c y escribe casos/*.salida
python -m labpar.banco verificar --slug omp-05-mi-laboratorio         # evalúa la solución docente y la plantilla
```

## 6. Exportar e importar

Desde el banco, el botón de descarga exporta el laboratorio completo, con sus casos, a un archivo `.labpar.json`, y **Importar** lo crea en otra instalación o en otro semestre. Los laboratorios importados quedan como propios del docente que los importa.
