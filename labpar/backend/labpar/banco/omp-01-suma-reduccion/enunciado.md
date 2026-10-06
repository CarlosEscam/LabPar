## Contexto

Sumar muchos valores es la operación paralela más simple y, a la vez, la que mejor muestra el error más
frecuente en OpenMP: la **condición de carrera**. Si varios hilos ejecutan `suma += x` sobre la misma
variable compartida, pueden leer el mismo valor anterior y sobrescribirse mutuamente, perdiendo
actualizaciones. El resultado cambia de una ejecución a otra.

## Problema

Dados un entero $n$ y una semilla, calcula

$$S = \sum_{i=0}^{n-1} \text{valor}(i, \text{semilla})$$

donde `valor(i, semilla)` es la función de la plantilla, que devuelve un entero entre 0 y 999. Como cada
término depende solo de su índice, las iteraciones son independientes entre sí: el bucle es
*paralelizable de forma trivial*, salvo por la acumulación en `suma`.

## Entrada

Una línea con dos enteros: $n$ ($0 \le n \le 10^9$) y la semilla.

## Salida

Una línea con el valor de $S$ (entero de 64 bits, `%lld`).

## Ejemplo

| Entrada | Salida |
|---|---|
| `10 1` | `5563` |

## Qué debes hacer

1. Paraleliza el bucle de la plantilla con `#pragma omp parallel for`.
2. Evita la condición de carrera sobre `suma` (piensa en qué cláusula combina resultados parciales).
3. Usa **Ejecutar** con 1 y con varios hilos para comparar resultados y tiempos antes de enviar.

## Medición de tiempo

La plantilla mide la región de interés con `omp_get_wtime()` y la imprime en la salida de errores como
`LABPAR_TIEMPO=…`. La plataforma usa ese valor para calcular la aceleración $S_p = T_1 / T_p$ frente a una
versión secuencial de referencia y la eficiencia $E_p = S_p / p$. No elimines esa línea.

## Para reflexionar

- ¿Por qué el error de la condición de carrera casi nunca aparece con $n = 10$ pero sí con $n = 10^7$?
- ¿Qué ocurriría con el resultado si `suma` fuera de tipo `int`?
