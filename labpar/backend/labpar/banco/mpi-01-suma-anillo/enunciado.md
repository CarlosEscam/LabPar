## Contexto

En memoria distribuida cada proceso tiene su propia memoria: no existe una variable `suma` compartida.
Para combinar resultados hay que **enviar mensajes**. En este laboratorio implementarás a mano una
acumulación en anillo con `MPI_Send` y `MPI_Recv`, la forma más elemental de comunicación punto a punto,
y practicarás el reparto de trabajo por bloques cuando $n$ no es divisible entre $p$.

## Problema

Calcula la misma suma del laboratorio OMP-01,

$$S = \sum_{i=0}^{n-1} \text{valor}(i, \text{semilla}),$$

pero repartiendo los índices entre $p$ procesos MPI.

1. **Reparto por bloques con resto.** Con $b = \lfloor n/p \rfloor$ y $r = n \bmod p$, el proceso $k$ recibe
   $b + 1$ índices si $k < r$ y $b$ en caso contrario, de forma contigua.
2. **Acumulación en anillo.** El proceso 0 envía su suma parcial al 1; cada proceso intermedio recibe del
   anterior, suma lo suyo y envía al siguiente; el proceso $p-1$ envía el total al proceso 0, que lo imprime.

## Entrada

Una línea con $n$ ($0 \le n \le 10^9$) y la semilla. Solo el proceso 0 puede leer la entrada estándar;
la plantilla ya difunde los datos con `MPI_Bcast`.

## Salida

Una línea con $S$, impresa **solo** por el proceso 0.

## Ejemplo

| Entrada | Salida |
|---|---|
| `10 1` | `5563` |

## Reglas del laboratorio

- La combinación de las sumas parciales debe hacerse con `MPI_Send` y `MPI_Recv` (no se permite `MPI_Reduce`).
- El programa debe funcionar con cualquier $p \ge 1$, incluido $p = 1$ y valores de $p$ que no dividen a $n$.
- La plataforma ejecuta tu programa con 1, 3 y 4 procesos.

## Para reflexionar

- ¿Qué pasaría si todos los procesos llamaran primero a `MPI_Recv`?
- El anillo necesita $p$ mensajes en secuencia. ¿Cuántos pasos necesitaría una reducción en árbol?
