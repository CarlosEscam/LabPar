/*
 * OMP-03 · Conteo de primos y planificación de bucles
 *
 * Cuenta los números primos menores o iguales que N usando división por tentativa.
 * Paraleliza el conteo con OpenMP y observa cómo influye la planificación (schedule)
 * cuando el costo de cada iteración no es el mismo.
 */
#include <stdio.h>
#include <omp.h>

/* Devuelve 1 si k es primo. Su costo crece con √k: los números grandes cuestan más. */
static int es_primo(long long k) {
    if (k < 2) return 0;
    if (k % 2 == 0) return k == 2;
    for (long long d = 3; d * d <= k; d += 2) {
        if (k % d == 0) return 0;
    }
    return 1;
}

int main(void) {
    long long N;
    if (scanf("%lld", &N) != 1) {
        fprintf(stderr, "Entrada inválida\n");
        return 1;
    }

    double t0 = omp_get_wtime();

    long long cuenta = 0;
    /* TODO: paraleliza este bucle. Después experimenta con la cláusula schedule. */
    for (long long k = 2; k <= N; k++) {
        if (es_primo(k)) cuenta++;
    }

    double t1 = omp_get_wtime();

    printf("%lld\n", cuenta);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    return 0;
}
