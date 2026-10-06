/* Solución docente (no se muestra a los estudiantes). */
#include <stdio.h>
#include <mpi.h>

static inline unsigned long long mezclar(unsigned long long x) {
    x += 0x9E3779B97F4A7C15ULL;
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ULL;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBULL;
    return x ^ (x >> 31);
}

static inline long long valor(long long i, long long semilla) {
    return (long long)(mezclar((unsigned long long)i + 0x632BE59BD9B4E019ULL * (unsigned long long)semilla) % 1000ULL);
}

int main(int argc, char **argv) {
    MPI_Init(&argc, &argv);
    int rango, p;
    MPI_Comm_rank(MPI_COMM_WORLD, &rango);
    MPI_Comm_size(MPI_COMM_WORLD, &p);

    long long datos[2] = {0, 0};
    if (rango == 0 && scanf("%lld %lld", &datos[0], &datos[1]) != 2) MPI_Abort(MPI_COMM_WORLD, 1);
    MPI_Bcast(datos, 2, MPI_LONG_LONG, 0, MPI_COMM_WORLD);
    long long n = datos[0], semilla = datos[1];

    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();

    long long base = n / p, resto = n % p;
    long long inicio = rango * base + (rango < resto ? rango : resto);
    long long cantidad = base + (rango < resto ? 1 : 0);

    long long parcial = 0;
    for (long long i = inicio; i < inicio + cantidad; i++) parcial += valor(i, semilla);

    long long acumulado = parcial, recibido = 0, total = parcial;
    if (p > 1) {
        if (rango > 0) {
            MPI_Recv(&recibido, 1, MPI_LONG_LONG, rango - 1, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
            acumulado += recibido;
        }
        MPI_Send(&acumulado, 1, MPI_LONG_LONG, (rango + 1) % p, 0, MPI_COMM_WORLD);
        if (rango == 0) MPI_Recv(&total, 1, MPI_LONG_LONG, p - 1, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);
    }

    double t1 = MPI_Wtime();
    if (rango == 0) {
        printf("%lld\n", total);
        fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    }
    MPI_Finalize();
    return 0;
}
