/*
 * MPI-03 · Producto matriz–vector distribuido (MPI_Gatherv)
 *
 * Calcula y = A·x para una matriz A de m × n. Cada proceso calcula un bloque de filas de y
 * (los elementos de A se generan con una fórmula, como si cada nodo los leyera de su disco local)
 * y el proceso 0 reúne los bloques con MPI_Gatherv, que admite bloques de tamaños distintos.
 */
#include <stdio.h>
#include <stdlib.h>
#include <mpi.h>

static inline double elemento_A(long long i, long long j) { return (double)((i * 31 + j * 17) % 100) / 8.0; }

int main(int argc, char **argv) {
    MPI_Init(&argc, &argv);
    int rango, p;
    MPI_Comm_rank(MPI_COMM_WORLD, &rango);
    MPI_Comm_size(MPI_COMM_WORLD, &p);

    long long dim[2] = {0, 0};
    if (rango == 0 && (scanf("%lld %lld", &dim[0], &dim[1]) != 2 || dim[0] <= 0 || dim[1] <= 0)) {
        fprintf(stderr, "Entrada inválida\n");
        MPI_Abort(MPI_COMM_WORLD, 1);
    }
    MPI_Bcast(dim, 2, MPI_LONG_LONG, 0, MPI_COMM_WORLD);
    long long m = dim[0], n = dim[1];

    /* El proceso 0 construye x y lo difunde a todos. */
    double *x = malloc((size_t)n * sizeof(double));
    if (rango == 0)
        for (long long j = 0; j < n; j++) x[j] = (double)((j * 7) % 10) / 4.0;
    MPI_Bcast(x, (int)n, MPI_DOUBLE, 0, MPI_COMM_WORLD);

    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();

    /* TODO 1: calcula el bloque de filas [inicio, inicio + filas) de este proceso
       (reparto por bloques: los primeros m % p procesos reciben una fila más). */
    long long inicio = 0, filas = m;

    double *y_local = malloc((size_t)(filas > 0 ? filas : 1) * sizeof(double));
    for (long long f = 0; f < filas; f++) {
        long long i = inicio + f;
        double acumulado = 0.0;
        for (long long j = 0; j < n; j++) acumulado += elemento_A(i, j) * x[j];
        y_local[f] = acumulado;
    }

    /* TODO 2: reúne los bloques en «y» del proceso 0 con MPI_Gatherv.
       Necesitas, en el proceso 0, los arreglos recvcounts (filas de cada proceso) y displs
       (posición donde empieza cada bloque). */
    double *y = y_local;

    double t1 = MPI_Wtime();
    if (rango == 0) {
        double suma = 0.0, ponderada = 0.0;
        for (long long i = 0; i < m; i++) {
            suma += y[i];
            ponderada += y[i] * (double)(i % 5 + 1);
        }
        printf("%.5f\n%.5f\n%.5f\n", suma, ponderada, y[m - 1]);
        fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    }
    free(x);
    free(y_local);
    MPI_Finalize();
    return 0;
}
