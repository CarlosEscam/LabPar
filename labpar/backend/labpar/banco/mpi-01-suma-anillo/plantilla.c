/*
 * MPI-01 · Suma distribuida con paso de mensajes en anillo
 *
 * Cada proceso suma un bloque de términos y los resultados parciales se acumulan pasando un
 * mensaje de proceso en proceso: 0 → 1 → … → p−1 → 0. El proceso 0 imprime el total.
 * En este laboratorio la combinación debe hacerse con MPI_Send/MPI_Recv (sin MPI_Reduce).
 */
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

    /* El proceso 0 lee la entrada y la difunde (la entrada estándar solo llega al proceso 0). */
    long long datos[2] = {0, 0};
    if (rango == 0 && scanf("%lld %lld", &datos[0], &datos[1]) != 2) {
        fprintf(stderr, "Entrada inválida\n");
        MPI_Abort(MPI_COMM_WORLD, 1);
    }
    MPI_Bcast(datos, 2, MPI_LONG_LONG, 0, MPI_COMM_WORLD);
    long long n = datos[0], semilla = datos[1];

    MPI_Barrier(MPI_COMM_WORLD);
    double t0 = MPI_Wtime();

    /* TODO 1: calcula el bloque [inicio, inicio + cantidad) que le corresponde a este proceso.
       Reparte el resto (n % p) entre los primeros procesos para que la carga quede balanceada. */
    long long inicio = 0, cantidad = n;

    long long parcial = 0;
    for (long long i = inicio; i < inicio + cantidad; i++) {
        parcial += valor(i, semilla);
    }

    /* TODO 2: acumula las sumas parciales en anillo con MPI_Send y MPI_Recv:
       - el proceso 0 envía su parcial al proceso 1;
       - el proceso r (0 < r < p−1) recibe de r−1, suma su parcial y envía a r+1;
       - el proceso p−1 recibe de p−2, suma su parcial y envía el total al proceso 0.
       No olvides el caso p = 1. */
    long long total = parcial;

    double t1 = MPI_Wtime();
    if (rango == 0) {
        printf("%lld\n", total);
        fprintf(stderr, "LABPAR_TIEMPO=%.6f\n", t1 - t0);
    }
    MPI_Finalize();
    return 0;
}
