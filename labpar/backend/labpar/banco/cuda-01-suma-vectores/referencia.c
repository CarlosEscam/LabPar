/* Referencia secuencial en CPU (oculta para los estudiantes). */
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static double ahora(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (double)t.tv_sec + 1e-9 * (double)t.tv_nsec;
}

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1 || n <= 0) return 1;
    size_t bytes = (size_t)n * sizeof(double);
    double *a = malloc(bytes), *b = malloc(bytes), *c = malloc(bytes);
    if (!a || !b || !c) return 1;
    for (long long i = 0; i < n; i++) {
        a[i] = (double)(i % 1000) * 0.5;
        b[i] = (double)((i * 7) % 1000) * 0.25;
    }
    double t0 = ahora();
    for (long long i = 0; i < n; i++) c[i] = a[i] + b[i];
    double t1 = ahora();
    double suma = 0.0, ponderada = 0.0;
    for (long long i = 0; i < n; i++) {
        suma += c[i];
        ponderada += c[i] * (double)(i % 3 + 1);
    }
    printf("%.2f\n%.2f\n%.2f\n", suma, ponderada, c[n - 1]);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    free(a);
    free(b);
    free(c);
    return 0;
}
