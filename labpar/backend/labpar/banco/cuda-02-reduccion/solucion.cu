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

#define HILOS_POR_BLOQUE 256

__host__ __device__ inline unsigned long long mezclar(unsigned long long x) {
    x += 0x9E3779B97F4A7C15ULL;
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ULL;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBULL;
    return x ^ (x >> 31);
}

__host__ __device__ inline unsigned long long valor(long long i, long long semilla) {
    return mezclar((unsigned long long)i + 0x632BE59BD9B4E019ULL * (unsigned long long)semilla) % 1000ULL;
}

__global__ void sumar(long long n, long long semilla, unsigned long long *total) {
    __shared__ unsigned long long parcial[HILOS_POR_BLOQUE];
    unsigned long long local = 0;
    long long paso = (long long)blockDim.x * gridDim.x;
    for (long long i = (long long)blockIdx.x * blockDim.x + threadIdx.x; i < n; i += paso)
        local += valor(i, semilla);
    parcial[threadIdx.x] = local;
    __syncthreads();
    for (unsigned int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (threadIdx.x < s) parcial[threadIdx.x] += parcial[threadIdx.x + s];
        __syncthreads();
    }
    if (threadIdx.x == 0) atomicAdd(total, parcial[0]);
}

int main(void) {
    long long n, semilla;
    if (scanf("%lld %lld", &n, &semilla) != 2 || n < 0) return 1;
    VERIFICAR(cudaFree(0));
    cudaEvent_t inicio, fin;
    VERIFICAR(cudaEventCreate(&inicio));
    VERIFICAR(cudaEventCreate(&fin));
    VERIFICAR(cudaEventRecord(inicio));

    unsigned long long *d_total, total = 0;
    VERIFICAR(cudaMalloc(&d_total, sizeof(unsigned long long)));
    VERIFICAR(cudaMemset(d_total, 0, sizeof(unsigned long long)));
    long long bloques = (n + HILOS_POR_BLOQUE - 1) / HILOS_POR_BLOQUE;
    if (bloques > 4096) bloques = 4096;
    if (bloques < 1) bloques = 1;
    sumar<<<(unsigned int)bloques, HILOS_POR_BLOQUE>>>(n, semilla, d_total);
    VERIFICAR(cudaGetLastError());
    VERIFICAR(cudaMemcpy(&total, d_total, sizeof(unsigned long long), cudaMemcpyDeviceToHost));
    VERIFICAR(cudaFree(d_total));

    VERIFICAR(cudaEventRecord(fin));
    VERIFICAR(cudaEventSynchronize(fin));
    float ms = 0.0f;
    VERIFICAR(cudaEventElapsedTime(&ms, inicio, fin));
    printf("%llu\n", total);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", ms / 1000.0);
    return 0;
}
