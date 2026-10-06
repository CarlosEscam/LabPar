/* Solución docente (no se muestra a los estudiantes). */
#include <stdio.h>
#include <mpi.h>

int main(int argc, char **argv) {
    MPI_Init(&argc, &argv);
    int rango, p;
    MPI_Comm_rank(MPI_COMM_WORLD, &rango);
    MPI_Comm_size(MPI_COMM_WORLD, &p);
    long long n = 0;
    if (rango == 0 && (scanf("%lld", &n) != 1 || n <= 0)) MPI_Abort(MPI_COMM_WORLD, 1);
    MPI_Bcast(&n, 1, MPI_LONG_LONG, 0, MPI_COMM_WORLD);

    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();
    double h = 1.0 / (double)n, local = 0.0;
    for (long long i = rango; i < n; i += p) {
        double x = ((double)i + 0.5) * h;
        local += 4.0 / (1.0 + x * x);
    }
    double total = 0.0;
    MPI_Reduce(&local, &total, 1, MPI_DOUBLE, MPI_SUM, 0, MPI_COMM_WORLD);
    double t1 = MPI_Wtime();
    if (rango == 0) {
        printf("%.12f\n", h * total);
        fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    }
    MPI_Finalize();
    return 0;
}
