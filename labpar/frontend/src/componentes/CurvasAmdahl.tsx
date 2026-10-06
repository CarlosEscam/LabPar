import { useRef } from "react";
import { useAncho } from "../lib/ganchos";

// Curvas de la ley de Amdahl en ejes logarítmicos (base 2), dibujadas sobre papel cuadriculado.
// Es la imagen que mejor resume la asignatura: la fracción serial limita la aceleración.

const FRACCIONES = [0.01, 0.05, 0.1, 0.25];
const P_MAX = 64;

function amdahl(f: number, p: number) {
  return 1 / (f + (1 - f) / p);
}

export function CurvasAmdahl({ alto = 300 }: { alto?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const ancho = useAncho(ref, 520);
  const m = { izq: 44, der: 64, sup: 16, inf: 40 };
  const w = Math.max(240, ancho) - m.izq - m.der;
  const h = alto - m.sup - m.inf;
  const lg = Math.log2(P_MAX);
  const x = (p: number) => m.izq + (Math.log2(p) / lg) * w;
  const y = (s: number) => m.sup + h - (Math.log2(s) / lg) * h;
  const marcas = [1, 2, 4, 8, 16, 32, 64];
  const puntos = (f: number) => {
    const ps: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const p = 2 ** ((i / 120) * lg);
      ps.push(`${x(p).toFixed(1)},${y(amdahl(f, p)).toFixed(1)}`);
    }
    return ps.join(" ");
  };

  return (
    <div ref={ref} className="curvas-amdahl">
      <svg
        width={ancho}
        height={alto}
        role="img"
        aria-label="Ley de Amdahl: aceleración frente al número de procesadores para fracciones seriales de 1, 5, 10 y 25 por ciento"
      >
        {marcas.map((p) => (
          <g key={p}>
            <line x1={x(p)} x2={x(p)} y1={m.sup} y2={m.sup + h} stroke="var(--cuadricula-fuerte)" />
            <line x1={m.izq} x2={m.izq + w} y1={y(p)} y2={y(p)} stroke="var(--cuadricula-fuerte)" />
            <text x={x(p)} y={m.sup + h + 20} textAnchor="middle" className="eje-texto">
              {p}
            </text>
            <text x={m.izq - 10} y={y(p) + 4} textAnchor="end" className="eje-texto">
              {p}
            </text>
          </g>
        ))}
        <line x1={x(1)} y1={y(1)} x2={x(P_MAX)} y2={y(P_MAX)} stroke="var(--grafito)" strokeWidth="1.5" strokeDasharray="5 5" />
        <text x={x(P_MAX) + 8} y={y(P_MAX) + 4} className="eje-texto">
          ideal
        </text>
        {FRACCIONES.map((f, i) => (
          <g key={f}>
            <polyline points={puntos(f)} fill="none" stroke="var(--tinta)" strokeWidth={2.5 - i * 0.35} strokeOpacity={1 - i * 0.18} />
            <text x={x(P_MAX) + 8} y={y(amdahl(f, P_MAX)) + 4} className="curva-texto">
              f = {String(f * 100).replace(".", ",")} %
            </text>
          </g>
        ))}
        <text x={m.izq + w / 2} y={alto - 4} textAnchor="middle" className="eje-titulo">
          Procesadores p
        </text>
        <text transform={`translate(12 ${m.sup + h / 2}) rotate(-90)`} textAnchor="middle" className="eje-titulo">
          Aceleración S
        </text>
      </svg>
    </div>
  );
}
