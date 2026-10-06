## Contexto

No todos los bucles tienen iteraciones del mismo costo. Si el trabajo crece con el índice, repartir el
rango en bloques contiguos de igual tamaño (lo que hace por defecto `schedule(static)`) deja al último hilo
con la parte más costosa: los demás terminan antes y esperan. Este **desbalance de carga** limita la
aceleración aunque no haya ningún error de sincronización.

## Problema

Cuenta cuántos números primos hay entre 2 y $N$. La plantilla usa división por tentativa: para decidir si
$k$ es primo prueba divisores impares hasta $\sqrt{k}$, de modo que **el costo de cada iteración crece con
$k$**.

## Entrada

Una línea con el entero $N$ ($1 \le N \le 10^8$).

## Salida

Una línea con la cantidad de primos $\le N$.

## Ejemplos

| Entrada | Salida |
|---|---|
| `10` | `4` |
| `100` | `25` |

## Qué debes hacer

1. Paraleliza el conteo (necesitarás una reducción).
2. Envía primero la versión con la planificación por defecto y anota la aceleración y la eficiencia.
3. Prueba `schedule(dynamic, bloque)` y `schedule(guided)` con distintos tamaños de bloque.
4. Compara los resultados en tu historial de envíos: ¿cuál planificación escala mejor y por qué?

## Planificaciones de OpenMP

| Planificación | Reparto | Sobrecarga |
|---|---|---|
| `static` | Bloques contiguos fijos asignados antes de empezar | Mínima |
| `dynamic, b` | Cada hilo toma un bloque de `b` iteraciones cuando termina el anterior | Crece si `b` es pequeño |
| `guided` | Bloques grandes al principio que se reducen progresivamente | Intermedia |

## Para reflexionar

- Con $p$ hilos y planificación estática, ¿qué fracción del trabajo total recibe el último hilo?
- ¿Por qué `schedule(dynamic, 1)` puede ser más lento que `schedule(dynamic, 1000)`?
