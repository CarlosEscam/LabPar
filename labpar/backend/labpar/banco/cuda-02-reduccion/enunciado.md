## Contexto

Una **reducción** combina muchos valores en uno (suma, máximo…). En la GPU, la forma ingenua —que cada
hilo haga `atomicAdd` sobre la misma variable global— es correcta pero lenta: las operaciones atómicas
sobre una misma dirección se serializan. La técnica estándar combina tres ideas:

1. un bucle **grid-stride**, en el que cada hilo acumula varios elementos en una variable local;
2. una **reducción en árbol** dentro de cada bloque, usando memoria compartida (`__shared__`) y
   `__syncthreads()`;
3. un único `atomicAdd` por bloque para combinar los resultados de todos los bloques.

## Problema

Calcula la misma suma de OMP-01 y MPI-01:

$$S = \sum_{i=0}^{n-1} \text{valor}(i, \text{semilla}).$$

Los valores se generan dentro del kernel (no hay que copiar arreglos), así que el problema tiene mucho
cómputo y casi ninguna transferencia: el caso ideal para una GPU.

## Entrada

Una línea con $n$ ($0 \le n \le 10^{10}$) y la semilla.

## Salida

Una línea con $S$ (`%llu`).

## Ejemplo

| Entrada | Salida |
|---|---|
| `10 1` | `5563` |

## Qué debes hacer

La plantilla ya es correcta con la versión ingenua. Reescribe el kernel:

1. Acumula en `unsigned long long local` con el bucle grid-stride.
2. Guarda `local` en `__shared__ unsigned long long parcial[HILOS_POR_BLOQUE]` y sincroniza.
3. Reduce en árbol: en cada paso, los hilos con `threadIdx.x < s` suman `parcial[threadIdx.x + s]`,
   con `s` = 128, 64, …, 1, y un `__syncthreads()` después de cada paso.
4. El hilo 0 de cada bloque hace `atomicAdd(total, parcial[0])`.

## Rendimiento

La aceleración se mide frente a la versión secuencial en CPU de OMP-01. El objetivo es $S \ge 10$.
