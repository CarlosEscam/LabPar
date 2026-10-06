/* Solución docente (no se muestra a los estudiantes). */
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

__global__ void sumar(const double *a, const double *b, double *c, long long n) {
    long long i = (long long)blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1 || n <= 0) return 1;
    size_t bytes = (size_t)n * sizeof(double);
    double *a = (double *)malloc(bytes), *b = (double *)malloc(bytes), *c = (double *)malloc(bytes);
    if (!a || !b || !c) return 1;
    for (long long i = 0; i < n; i++) {
        a[i] = (double)(i % 1000) * 0.5;
        b[i] = (double)((i * 7) % 1000) * 0.25;
    }

    VERIFICAR(cudaFree(0));
    cudaEvent_t inicio, fin;
    VERIFICAR(cudaEventCreate(&inicio));
    VERIFICAR(cudaEventCreate(&fin));
    VERIFICAR(cudaEventRecord(inicio));

    double *d_a, *d_b, *d_c;
    VERIFICAR(cudaMalloc(&d_a, bytes));
    VERIFICAR(cudaMalloc(&d_b, bytes));
    VERIFICAR(cudaMalloc(&d_c, bytes));
    VERIFICAR(cudaMemcpy(d_a, a, bytes, cudaMemcpyHostToDevice));
    VERIFICAR(cudaMemcpy(d_b, b, bytes, cudaMemcpyHostToDevice));
    int hilos = 256;
    long long bloques = (n + hilos - 1) / hilos;
    sumar<<<(unsigned int)bloques, hilos>>>(d_a, d_b, d_c, n);
    VERIFICAR(cudaGetLastError());
    VERIFICAR(cudaMemcpy(c, d_c, bytes, cudaMemcpyDeviceToHost));
    VERIFICAR(cudaFree(d_a));
    VERIFICAR(cudaFree(d_b));
    VERIFICAR(cudaFree(d_c));

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
