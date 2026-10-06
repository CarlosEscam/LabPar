## Contexto

La multiplicación de matrices es el núcleo de la simulación científica y del aprendizaje profundo. Tiene
$O(n^3)$ operaciones sobre $O(n^2)$ datos, por lo que hay mucho cómputo por dato y se paraleliza bien… si
se reparten las filas entre los hilos y se cuida el alcance de las variables.

## Problema

Para matrices $n \times n$ definidas por

$$A_{ij} = \frac{(7i + 3j) \bmod 17}{4} - 2, \qquad B_{ij} = \frac{(5i + 11j) \bmod 13}{8} - 0.75,$$

calcula $C = A \times B$ y reporta tres valores de control con 5 decimales:

1. la suma de todos los elementos de $C$;
2. la suma ponderada $\sum_{i,j} C_{ij}\,\big((i + 2j) \bmod 7 + 1\big)$;
3. la traza de $C$.

Los valores de $A$ y $B$ son múltiplos de $1/4$ y $1/8$, así que todos los productos y sumas son exactos en
`double`: el resultado no depende del orden en que los hilos sumen.

## Entrada

Una línea con el entero $n$ ($1 \le n \le 3000$).

## Salida

Tres líneas: suma, suma ponderada y traza (`%.5f`).

## Ejemplo

| Entrada | Salida |
|---|---|
| `2` | `0.65625`<br>`-1.81250`<br>`1.31250` |

## Qué debes hacer

1. Paraleliza el bucle externo (`i`) de la multiplicación.
2. En la plantilla `i`, `j` y `k` están declaradas fuera de los bucles: decide cuáles deben ser privadas.
3. Opcional: paraleliza también el cálculo de los valores de control con una reducción de varias variables.

## Para profundizar

El orden de los bucles importa. La plantilla usa el orden **i-k-j**, que recorre `B` y `C` por filas
(posiciones contiguas en memoria) y aprovecha la caché. Prueba con **Ejecutar** el orden i-j-k con
$n = 800$ y compara los tiempos.
