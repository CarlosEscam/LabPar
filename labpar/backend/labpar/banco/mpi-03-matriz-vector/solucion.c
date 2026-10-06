/* Solución docente (no se muestra a los estudiantes). */
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
    if (rango == 0 && (scanf("%lld %lld", &dim[0], &dim[1]) != 2 || dim[0] <= 0 || dim[1] <= 0)) MPI_Abort(MPI_COMM_WORLD, 1);
    MPI_Bcast(dim, 2, MPI_LONG_LONG, 0, MPI_COMM_WORLD);
    long long m = dim[0], n = dim[1];

    double *x = malloc((size_t)n * sizeof(double));
    if (rango == 0)
        for (long long j = 0; j < n; j++) x[j] = (double)((j * 7) % 10) / 4.0;
    MPI_Bcast(x, (int)n, MPI_DOUBLE, 0, MPI_COMM_WORLD);

    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();

    long long base = m / p, resto = m % p;
    long long inicio = rango * base + (rango < resto ? rango : resto);
    long long filas = base + (rango < resto ? 1 : 0);

    double *y_local = malloc((size_t)(filas > 0 ? filas : 1) * sizeof(double));
    for (long long f = 0; f < filas; f++) {
        long long i = inicio + f;
        double acumulado = 0.0;
        for (long long j = 0; j < n; j++) acumulado += elemento_A(i, j) * x[j];
        y_local[f] = acumulado;
    }

    int *recvcounts = NULL, *displs = NULL;
    double *y = NULL;
    if (rango == 0) {
        recvcounts = malloc((size_t)p * sizeof(int));
        displs = malloc((size_t)p * sizeof(int));
        y = malloc((size_t)m * sizeof(double));
        for (int k = 0; k < p; k++) {
            recvcounts[k] = (int)(base + (k < resto ? 1 : 0));
            displs[k] = (int)(k * base + (k < resto ? k : resto));
        }
    }
    MPI_Gatherv(y_local, (int)filas, MPI_DOUBLE, y, recvcounts, displs, MPI_DOUBLE, 0, MPI_COMM_WORLD);

    double t1 = MPI_Wtime();
    if (rango == 0) {
        double suma = 0.0, ponderada = 0.0;
        for (long long i = 0; i < m; i++) {
            suma += y[i];
            ponderada += y[i] * (double)(i % 5 + 1);
        }
        printf("%.5f\n%.5f\n%.5f\n", suma, ponderada, y[m - 1]);
        fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
        free(recvcounts);
        free(displs);
        free(y);
    }
    free(x);
    free(y_local);
    MPI_Finalize();
    return 0;
}
