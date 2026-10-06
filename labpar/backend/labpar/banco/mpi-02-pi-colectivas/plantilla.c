/*
 * MPI-02 · π con operaciones colectivas
 *
 * Aproxima π = ∫₀¹ 4 / (1 + x²) dx con la regla del punto medio, repartiendo los n subintervalos
 * entre los procesos de forma cíclica y combinando los resultados con operaciones colectivas.
 */
#include <stdio.h>
#include <mpi.h>

int main(int argc, char **argv) {
    MPI_Init(&argc, &argv);
    int rango, p;
    MPI_Comm_rank(MPI_COMM_WORLD, &rango);
    MPI_Comm_size(MPI_COMM_WORLD, &p);

    long long n = 0;
    if (rango == 0 && (scanf("%lld", &n) != 1 || n <= 0)) {
        fprintf(stderr, "Entrada inválida\n");
        MPI_Abort(MPI_COMM_WORLD, 1);
    }
    /* TODO 1: difunde n desde el proceso 0 a todos los procesos con MPI_Bcast. */

    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();

    double h = 1.0 / (double)n;
    double local = 0.0;
    /* TODO 2: reparto cíclico: el proceso «rango» procesa i = rango, rango + p, rango + 2p, … */
    for (long long i = 0; i < n; i++) {
        double x = ((double)i + 0.5) * h;
        local += 4.0 / (1.0 + x * x);
    }

    double total = local;
    /* TODO 3: suma los valores «local» de todos los procesos en «total» del proceso 0 con MPI_Reduce. */

    double t1 = MPI_Wtime();
    if (rango == 0) {
        printf("%.12f\n", h * total);
        fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    }
    MPI_Finalize();
    return 0;
}
