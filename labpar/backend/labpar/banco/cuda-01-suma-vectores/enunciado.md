## Contexto

Una GPU ejecuta miles de hilos ligeros organizados en una **malla** (*grid*) de **bloques**. En CUDA el
programador escribe un *kernel* —la función que ejecuta cada hilo— y lo lanza desde el host con
`kernel<<<bloques, hilosPorBloque>>>(...)`. Como la GPU tiene su propia memoria, los datos deben copiarse
del host al dispositivo y de vuelta.

## Problema

Para vectores de $n$ elementos con

$$a_i = 0.5\,(i \bmod 1000), \qquad b_i = 0.25\,(7i \bmod 1000),$$

calcula $c_i = a_i + b_i$ en la GPU y reporta, con 2 decimales:

1. $\sum_i c_i$;
2. $\sum_i c_i\,(i \bmod 3 + 1)$;
3. $c_{n-1}$.

## Entrada

Una línea con $n$ ($1 \le n \le 5 \cdot 10^7$).

## Salida

Tres líneas con los valores de control (`%.2f`).

## Ejemplo

| Entrada | Salida |
|---|---|
| `5` | `22.50`<br>`42.75`<br>`9.00` |

## Qué debes hacer

1. Completa el kernel: índice global `i = blockIdx.x * blockDim.x + threadIdx.x` y verificación `i < n`.
2. Reserva memoria en la GPU con `cudaMalloc` y copia `a` y `b` con `cudaMemcpy`.
3. Lanza el kernel con 256 hilos por bloque y $\lceil n/256 \rceil$ bloques.
4. Copia `c` de vuelta y libera la memoria con `cudaFree`.

## Sobre el rendimiento

En este laboratorio el rendimiento **no se califica**: se muestra como información. La plantilla mide con
eventos de CUDA el tiempo de las copias y del kernel, y la plataforma lo compara con el tiempo de la suma
en la CPU. Observa el resultado: con una sola suma por elemento, copiar los datos por el bus PCIe cuesta
más que la operación. Las GPU ganan cuando hay mucho cómputo por cada dato transferido (como en CUDA-02).
