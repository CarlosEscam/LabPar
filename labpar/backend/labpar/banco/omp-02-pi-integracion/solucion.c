/* Solución docente (no se muestra a los estudiantes). */
#include <stdio.h>
#include <omp.h>

int main(void) {
    long long n;
    if (scanf("%lld", &n) != 1 || n <= 0) return 1;
    double t0 = omp_get_wtime();
    double h = 1.0 / (double)n;
    double x, suma = 0.0;
    #pragma omp parallel for private(x) reduction(+:suma)
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
