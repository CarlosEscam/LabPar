/* Solución docente (no se muestra a los estudiantes). */
#include <stdio.h>
#include <omp.h>

static inline unsigned long long mezclar(unsigned long long x) {
    x += 0x9E3779B97F4A7C15ULL;
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ULL;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBULL;
    return x ^ (x >> 31);
}

static inline long long valor(long long i, long long semilla) {
    return (long long)(mezclar((unsigned long long)i + 0x632BE59BD9B4E019ULL * (unsigned long long)semilla) % 1000ULL);
}

int main(void) {
    long long n, semilla;
    if (scanf("%lld %lld", &n, &semilla) != 2) return 1;
    double t0 = omp_get_wtime();
    long long suma = 0;
    #pragma omp parallel for reduction(+:suma)
    for (long long i = 0; i < n; i++) {
        suma += valor(i, semilla);
    }
    double t1 = omp_get_wtime();
    printf("%lld\n", suma);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    return 0;
}
