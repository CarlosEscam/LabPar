/* Referencia secuencial (oculta para los estudiantes). */
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static double ahora(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (double)t.tv_sec + 1e-9 * (double)t.tv_nsec;
}

static inline double elemento_A(long long i, long long j) { return (double)((i * 31 + j * 17) % 100) / 8.0; }

int main(void) {
    long long m, n;
    if (scanf("%lld %lld", &m, &n) != 2 || m <= 0 || n <= 0) return 1;
    double *x = malloc((size_t)n * sizeof(double));
    double *y = malloc((size_t)m * sizeof(double));
    for (long long j = 0; j < n; j++) x[j] = (double)((j * 7) % 10) / 4.0;
    double t0 = ahora();
    for (long long i = 0; i < m; i++) {
        double acumulado = 0.0;
        for (long long j = 0; j < n; j++) acumulado += elemento_A(i, j) * x[j];
        y[i] = acumulado;
    }
    double t1 = ahora();
    double suma = 0.0, ponderada = 0.0;
    for (long long i = 0; i < m; i++) {
        suma += y[i];
        ponderada += y[i] * (double)(i % 5 + 1);
    }
    printf("%.5f\n%.5f\n%.5f\n", suma, ponderada, y[m - 1]);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    free(x);
    free(y);
    return 0;
}
