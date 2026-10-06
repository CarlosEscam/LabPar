## Contexto

Las **operaciones colectivas** involucran a todos los procesos de un comunicador y están optimizadas por la
biblioteca MPI (por ejemplo, con árboles de comunicación). Dos de las más usadas son `MPI_Bcast`, que
difunde un dato desde un proceso raíz a todos los demás, y `MPI_Reduce`, que combina un valor de cada
proceso con una operación (suma, máximo, …) y deja el resultado en la raíz.

## Problema

Aproxima $\pi$ igual que en OMP-02:

$$\pi \approx h \sum_{i=0}^{n-1} \frac{4}{1 + x_i^2}, \qquad x_i = (i + 0.5)\,h, \qquad h = \frac{1}{n},$$

con un **reparto cíclico**: el proceso de rango $k$ procesa los índices $k, k + p, k + 2p, \dots$

## Entrada

Una línea con $n$ ($1 \le n \le 10^9$), leída solo por el proceso 0.

## Salida

El valor aproximado de $\pi$ con 12 decimales, impreso solo por el proceso 0.

## Ejemplo

| Entrada | Salida |
|---|---|
| `4` | `3.146800518394` |

## Qué debes hacer

1. Difunde `n` con `MPI_Bcast` (todos los procesos deben llamarla).
2. Modifica el bucle para que cada proceso recorra solo sus índices.
3. Combina las sumas locales con `MPI_Reduce` usando `MPI_SUM`.

La comparación de salidas usa una tolerancia relativa de $10^{-9}$, porque el orden de las sumas cambia
con $p$.

## Reparto cíclico frente a reparto por bloques

En este problema todos los términos cuestan lo mismo, así que ambos repartos están balanceados. El reparto
cíclico es útil cuando el costo varía a lo largo del rango (como en OMP-03), porque mezcla iteraciones
baratas y costosas en cada proceso.
