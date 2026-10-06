// Valores por defecto y esqueletos para crear laboratorios nuevos (deben coincidir con CONFIG_POR_DEFECTO del motor).
import type { Modelo } from "./tipos";

export const CONFIG_POR_DEFECTO = {
  hilos_correccion: [1, 4],
  repeticiones_correccion: 2,
  hilos_rendimiento: [1, 2, 4, 8],
  repeticiones_rendimiento: 3,
  tiempo_limite_s: 10,
  tiempo_limite_rendimiento_s: 30,
  tiempo_total_correccion_s: 120,
  memoria_mb: 512,
  comparacion: "tokens",
  tolerancia_rel: 1e-9,
  tolerancia_abs: 1e-12,
  peso_correccion: 70,
  peso_rendimiento: 30,
  eficiencia_objetivo: 0.6,
  aceleracion_objetivo: null,
  entrada_rendimiento: null,
  requisitos: [],
  prohibidos: [],
  flags_compilacion: [],
  pistas_rendimiento: [],
} as const;

export const NIVELES_BLOOM = ["Recordar", "Comprender", "Aplicar", "Analizar", "Evaluar", "Crear"] as const;

export const PLANTILLAS: Record<Modelo, string> = {
  openmp: `#include <stdio.h>
#include <omp.h>

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1) return 1;

    double t0 = omp_get_wtime();
    long long suma = 0;
    /* TODO: paraleliza este bucle con OpenMP. */
    for (long long i = 0; i < n; i++) {
        suma += i % 7;
    }
    double t1 = omp_get_wtime();

    printf("%lld\\n", suma);
    /* La plataforma usa esta línea para medir la aceleración: no la elimines. */
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\\n", t1 - t0);
    return 0;
}
`,
  mpi: `#include <stdio.h>
#include <mpi.h>

int main(int argc, char **argv) {
    int rango, p;
    MPI_Init(&argc, &argv);
    MPI_Comm_rank(MPI_COMM_WORLD, &rango);
    MPI_Comm_size(MPI_COMM_WORLD, &p);

    long long n = 0;
    if (rango == 0 && scanf("%lld", &n) != 1) MPI_Abort(MPI_COMM_WORLD, 1);
    MPI_Bcast(&n, 1, MPI_LONG_LONG, 0, MPI_COMM_WORLD);

    double t0 = MPI_Wtime();
    long long suma = 0;
    /* TODO: reparte el trabajo entre los p procesos y combina los resultados. */
    if (rango == 0) {
        for (long long i = 0; i < n; i++) suma += i % 7;
    }
    double t1 = MPI_Wtime();

    if (rango == 0) {
        printf("%lld\\n", suma);
        fprintf(stderr, "LABPAR_TIEMPO=%.6f\\n", t1 - t0);
    }
    MPI_Finalize();
    return 0;
}
`,
  cuda: `#include <stdio.h>
#include <cuda_runtime.h>

#define VERIFICAR(x) do { cudaError_t e = (x); if (e != cudaSuccess) { \\
    fprintf(stderr, "CUDA: %s\\n", cudaGetErrorString(e)); return 1; } } while (0)

__global__ void kernel(const float *a, float *b, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) b[i] = 2.0f * a[i];  /* TODO: implementa el cálculo del laboratorio. */
}

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 1;
    /* Reserva, copia al dispositivo, lanza el kernel, sincroniza y copia de vuelta. */
    cudaEvent_t inicio, fin;
    VERIFICAR(cudaEventCreate(&inicio));
    VERIFICAR(cudaEventCreate(&fin));
    VERIFICAR(cudaEventRecord(inicio));
    /* … */
    VERIFICAR(cudaEventRecord(fin));
    VERIFICAR(cudaEventSynchronize(fin));
    float ms = 0;
    VERIFICAR(cudaEventElapsedTime(&ms, inicio, fin));
    printf("%d\\n", n);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\\n", ms / 1000.0f);
    return 0;
}
`,
};

export const REFERENCIA_POR_DEFECTO = `/* Versión secuencial de referencia: define las salidas esperadas y el tiempo base de la aceleración. */
#include <stdio.h>
#include <time.h>

static double ahora(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec + t.tv_nsec * 1e-9;
}

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1) return 1;
    double t0 = ahora();
    long long suma = 0;
    for (long long i = 0; i < n; i++) suma += i % 7;
    double t1 = ahora();
    printf("%lld\\n", suma);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\\n", t1 - t0);
    return 0;
}
`;

export const ENUNCIADO_POR_DEFECTO = `## Contexto

Describe el problema y por qué es interesante paralelizarlo.

## Problema

Define formalmente qué se calcula. Puedes usar fórmulas: $S_p = T_1 / T_p$.

## Entrada

Formato de la entrada estándar.

## Salida

Formato exacto de la salida.

## Ejemplo

| Entrada | Salida |
|---|---|
| \`10\` | \`24\` |
`;
