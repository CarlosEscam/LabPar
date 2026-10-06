/* Solución docente (no se muestra a los estudiantes). */
#include <stdio.h>
#include <stdlib.h>
#include <omp.h>

int main(void) {
    int n;
    if (scanf("%d", &n) != 1 || n <= 0) return 1;
    double *A = malloc((size_t)n * n * sizeof(double));
    double *B = malloc((size_t)n * n * sizeof(double));
    double *C = malloc((size_t)n * n * sizeof(double));
    if (!A || !B || !C) return 1;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++) {
            A[(size_t)i * n + j] = ((i * 7 + j * 3) % 17) / 4.0 - 2.0;
            B[(size_t)i * n + j] = ((i * 5 + j * 11) % 13) / 8.0 - 0.75;
            C[(size_t)i * n + j] = 0.0;
        }
    double t0 = omp_get_wtime();
    int i, j, k;
    #pragma omp parallel for private(j, k)
    for (i = 0; i < n; i++) {
        for (k = 0; k < n; k++) {
            double a = A[(size_t)i * n + k];
            for (j = 0; j < n; j++) C[(size_t)i * n + j] += a * B[(size_t)k * n + j];
        }
    }
    double suma = 0.0, ponderada = 0.0, traza = 0.0;
    #pragma omp parallel for reduction(+:suma, ponderada, traza)
    for (int f = 0; f < n; f++) {
        traza += C[(size_t)f * n + f];
        for (int c = 0; c < n; c++) {
            double v = C[(size_t)f * n + c];
            suma += v;
            ponderada += v * (double)((f + 2 * c) % 7 + 1);
        }
    }
    double t1 = omp_get_wtime();
    printf("%.5f\n%.5f\n%.5f\n", suma, ponderada, traza);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    free(A);
    free(B);
    free(C);
    return 0;
}
