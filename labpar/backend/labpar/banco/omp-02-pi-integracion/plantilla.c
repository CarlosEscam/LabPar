/*
 * OMP-02 · Aproximación de π por integración numérica
 *
 * π = ∫₀¹ 4 / (1 + x²) dx, aproximada con la regla del punto medio y n subintervalos.
 * Paraleliza el bucle con OpenMP. Cuidado con las variables declaradas fuera del for.
 */
#include <stdio.h>
#include <omp.h>

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1 || n <= 0) {
        fprintf(stderr, "Entrada inválida\n");
        return 1;
    }

    double t0 = omp_get_wtime();

    double h = 1.0 / (double)n;
    double x, suma = 0.0;
    /* TODO: paraleliza este bucle. ¿Qué alcance (shared/private) deben tener x y suma? */
    for (long long i = 0; i < n; i++) {
        x = ((double)i + 0.5) * h;
        suma += 4.0 / (1.0 + x * x);
    }
    double pi = h * suma;

    double t1 = omp_get_wtime();

    printf("%.12f\n", pi);
    fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    return 0;
}
