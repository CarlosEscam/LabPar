/* Referencia secuencial (oculta para los estudiantes). */
#include <stdio.h>
#include <time.h>

static double ahora(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (double)t.tv_sec + 1e-9 * (double)t.tv_nsec;
}

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1 || n <= 0) return 1;
    double t0 = ahora();
    double h = 1.0 / (double)n, suma = 0.0;
    for (long long i = 0; i < n; i++) {
        double x = ((double)i + 0.5) * h;
        suma += 4.0 / (1.0 + x * x);
    }
    double pi = h * suma;
    double t1 = ahora();
    printf("%.12f\n", pi);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    return 0;
}
