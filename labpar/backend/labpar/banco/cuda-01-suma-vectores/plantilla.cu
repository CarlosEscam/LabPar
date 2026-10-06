/*
 * CUDA-01 · Suma de vectores en la GPU
 *
 * Calcula c = a + b para vectores de n elementos. El host genera a y b; tú debes reservar memoria
 * en la GPU, copiar los datos, lanzar el kernel y traer el resultado de vuelta.
 */
#include <stdio.h>
#include <stdlib.h>
#include <cuda_runtime.h>

#define VERIFICAR(llamada)                                                             \
    do {                                                                               \
        cudaError_t err_ = (llamada);                                                  \
        if (err_ != cudaSuccess) {                                                     \
            fprintf(stderr, "CUDA error: %s (línea %d)\n", cudaGetErrorString(err_), __LINE__); \
            exit(1);                                                                   \
        }                                                                              \
    } while (0)

/* TODO 1: cada hilo debe calcular un elemento: c[i] = a[i] + b[i].
   Calcula el índice global i y verifica que i < n. */
__global__ void sumar(const double *a, const double *b, double *c, long long n) {
}

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1 || n <= 0) {
        fprintf(stderr, "Entrada inválida\n");
        return 1;
    }
    size_t bytes = (size_t)n * sizeof(double);
    double *a = (double *)malloc(bytes), *b = (double *)malloc(bytes), *c = (double *)malloc(bytes);
    if (!a || !b || !c) {
        fprintf(stderr, "Memoria insuficiente\n");
        return 1;
    }
    for (long long i = 0; i < n; i++) {
        a[i] = (double)(i % 1000) * 0.5;
        b[i] = (double)((i * 7) % 1000) * 0.25;
    }

    VERIFICAR(cudaFree(0)); /* inicializa el contexto de CUDA fuera de la medición */
    cudaEvent_t inicio, fin;
    VERIFICAR(cudaEventCreate(&inicio));
    VERIFICAR(cudaEventCreate(&fin));
    VERIFICAR(cudaEventRecord(inicio));

    /* TODO 2: reserva d_a, d_b y d_c en la GPU (cudaMalloc) y copia a y b (cudaMemcpy). */

    /* TODO 3: lanza el kernel con bloques de 256 hilos y suficientes bloques para cubrir n. */

    /* TODO 4: copia d_c a c (cudaMemcpy) y libera la memoria de la GPU (cudaFree). */

    VERIFICAR(cudaEventRecord(fin));
    VERIFICAR(cudaEventSynchronize(fin));
    float ms = 0.0f;
    VERIFICAR(cudaEventElapsedTime(&ms, inicio, fin));

    double suma = 0.0, ponderada = 0.0;
    for (long long i = 0; i < n; i++) {
        suma += c[i];
        ponderada += c[i] * (double)(i % 3 + 1);
    }
    printf("%.2f\n%.2f\n%.2f\n", suma, ponderada, c[n - 1]);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", ms / 1000.0);
    free(a);
    free(b);
    free(c);
    return 0;
}
