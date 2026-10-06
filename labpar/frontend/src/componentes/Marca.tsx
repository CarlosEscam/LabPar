// Marca de LabPar: un hilo maestro que se bifurca en tres carriles (OpenMP, MPI, CUDA) y se vuelve a unir,
// como en el modelo fork–join. La misma figura, animada, indica que una evaluación está en curso.

export function Marca({ tamano = 28 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="2.6" strokeLinecap="round">
        <path d="M3 16h6M23 16h6" stroke="var(--tinta)" />
        <path d="M9 16c3 0 3-7 6-7h2c3 0 3 7 6 7" stroke="var(--omp)" />
        <path d="M9 16h14" stroke="var(--mpi)" />
        <path d="M9 16c3 0 3 7 6 7h2c3 0 3-7 6-7" stroke="var(--cuda)" />
      </g>
      <circle cx="9" cy="16" r="2.3" fill="var(--tinta)" />
      <circle cx="23" cy="16" r="2.3" fill="var(--tinta)" />
    </svg>
  );
}

export function Logotipo() {
  return (
    <span className="logotipo">
      <Marca />
      <span>LabPar</span>
    </span>
  );
}

/** Indicador animado de trabajo en paralelo (se detiene si el usuario prefiere menos movimiento). */
export function Carriles({ ancho = 120 }: { ancho?: number }) {
  return (
    <svg className="carriles" width={ancho} height={(ancho / 120) * 40} viewBox="0 0 120 40" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M4 20h20M96 20h20" stroke="var(--tinta)" />
        <path className="carril" d="M24 20c10 0 10-12 20-12h32c10 0 10 12 20 12" stroke="var(--omp)" />
        <path className="carril" d="M24 20h72" stroke="var(--mpi)" />
        <path className="carril" d="M24 20c10 0 10 12 20 12h32c10 0 10-12 20-12" stroke="var(--cuda)" />
      </g>
      <circle cx="24" cy="20" r="3.6" fill="var(--tinta)" />
      <circle cx="96" cy="20" r="3.6" fill="var(--tinta)" />
    </svg>
  );
}
