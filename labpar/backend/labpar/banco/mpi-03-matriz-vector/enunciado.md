## Contexto

El producto matriz–vector $y = A\,x$ aparece en métodos iterativos, simulaciones y redes neuronales. En un
clúster, la matriz suele estar repartida por filas entre los nodos y cada uno calcula su parte de $y$; al
final hay que **reunir** los bloques, que pueden tener tamaños distintos si $m$ no es divisible entre $p$.
Para eso existe `MPI_Gatherv`.

## Problema

Para una matriz $A$ de $m \times n$ y un vector $x$ de longitud $n$ definidos por

$$A_{ij} = \frac{(31i + 17j) \bmod 100}{8}, \qquad x_j = \frac{7j \bmod 10}{4},$$

calcula $y = A\,x$ y reporta, con 5 decimales:

1. $\sum_i y_i$;
2. $\sum_i y_i\,(i \bmod 5 + 1)$;
3. $y_{m-1}$.

Como $A_{ij}$ es múltiplo de $1/8$ y $x_j$ de $1/4$, los resultados son exactos en `double`.

## Entrada

Una línea con $m$ y $n$ ($1 \le m, n \le 50\,000$), leída por el proceso 0.

## Salida

Tres líneas, impresas solo por el proceso 0.

## Ejemplo

| Entrada | Salida |
|---|---|
| `2 3` | `26.59375`<br>`45.21875`<br>`18.62500` |

## Qué debes hacer

1. Calcula el bloque de filas de cada proceso (los primeros $m \bmod p$ procesos reciben una fila más).
2. Cada proceso calcula únicamente sus filas de $y$.
3. En el proceso 0, construye `recvcounts` y `displs` y reúne los bloques con `MPI_Gatherv`.

## Comunicación frente a cómputo

Cada proceso realiza $O(mn/p)$ operaciones y solo se comunican $O(m + n)$ valores (la difusión de $x$ y la
reunión de $y$). Esa relación entre cómputo y comunicación es la que permite una buena aceleración.
¿Qué pasaría si el proceso 0 tuviera que enviar la matriz completa con `MPI_Scatterv`?
