/* Referencia secuencial (oculta para los estudiantes). */
#include <stdio.h>
#include <time.h>

static double ahora(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (double)t.tv_sec + 1e-9 * (double)t.tv_nsec;
}

static int es_primo(long long k) {
    if (k < 2) return 0;
    if (k % 2 == 0) return k == 2;
    for (long long d = 3; d * d <= k; d += 2)
        if (k % d == 0) return 0;
    return 1;
}

int main(void) {
    long long N;
    if (scanf("%lld", &N) != 1) return 1;
    double t0 = ahora();
    long long cuenta = 0;
    for (long long k = 2; k <= N; k++)
        if (es_primo(k)) cuenta++;
    double t1 = ahora();
    printf("%lld\n", cuenta);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    return 0;
}
