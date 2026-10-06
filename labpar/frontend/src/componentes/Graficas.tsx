import { useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { useAncho } from "../lib/ganchos";

// Gráficas SVG propias: líneas de 2 px, marcadores de radio 4 con anillo del color de la superficie,
// cuadrícula fina y leyenda cuando hay dos o más series. El texto se dibuja a tamaño real (se mide el ancho).

export function ticksAgradables(min: number, max: number, n = 5, entero = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max - min < 1e-12) max = min + 1;
  const crudo = (max - min) / n;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const fraccion = crudo / potencia;
  let paso = (fraccion <= 1 ? 1 : fraccion <= 2 ? 2 : fraccion <= 2.5 ? 2.5 : fraccion <= 5 ? 5 : 10) * potencia;
  if (entero) paso = Math.max(1, Math.round(paso));
  const inicio = Math.floor(min / paso) * paso;
  const fin = Math.ceil(max / paso) * paso;
  const ticks: number[] = [];
  for (let v = inicio; v <= fin + paso / 2; v += paso) ticks.push(Math.round(v / paso) * paso);
  return ticks;
}

const formatoPorDefecto = (v: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(v);

export interface SerieLinea {
  id: string;
  nombre: string;
  color: string;
  puntos: { x: number; y: number }[];
  trazo?: "solida" | "discontinua" | "punteada";
  marcadores?: boolean;
  grosor?: number;
}

interface PropsLineas {
  series: SerieLinea[];
  xs: number[];
  escalaX?: "lineal" | "log2";
  escalaY?: "lineal" | "log2";
  yMin?: number;
  yMax?: number;
  tituloX: string;
  tituloY: string;
  etiqueta: string;
  alto?: number;
  formatoX?: (v: number) => string;
  formatoY?: (v: number) => string;
  leyenda?: boolean;
  bandas?: { desde: number; hasta: number; color: string; texto?: string }[];
}

export function GraficaLineas({
  series,
  xs,
  escalaX = "lineal",
  escalaY = "lineal",
  yMin = 0,
  yMax,
  tituloX,
  tituloY,
  etiqueta,
  alto = 280,
  formatoX = (v) => String(v),
  formatoY = formatoPorDefecto,
  leyenda = true,
  bandas = [],
}: PropsLineas) {
  const ref = useRef<HTMLDivElement>(null);
  const ancho = useAncho(ref, 560);
  const [foco, setFoco] = useState<number | null>(null);

  const m = { izq: 52, der: 18, sup: 14, inf: 46 };
  const w = Math.max(160, ancho - m.izq - m.der);
  const h = alto - m.sup - m.inf;
  const todosY = series.flatMap((s) => s.puntos.map((p) => p.y));
  const logY = escalaY === "log2";
  const maxY = yMax ?? Math.max(1, ...todosY) * (logY ? 1 : 1.08);
  // En escala logarítmica los ticks son potencias de 2 desde 1 (la aceleración nunca es menor que 1 en el ideal).
  const ticksY = logY
    ? Array.from({ length: Math.ceil(Math.log2(Math.max(2, maxY))) + 1 }, (_, i) => 2 ** i)
    : ticksAgradables(yMin, maxY, 5).filter((t) => t >= yMin);
  const techo = Math.max(maxY, ticksY[ticksY.length - 1] ?? maxY);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const tx = (v: number) => {
    if (xMax === xMin) return m.izq + w / 2;
    if (escalaX === "log2") return m.izq + ((Math.log2(v) - Math.log2(xMin)) / (Math.log2(xMax) - Math.log2(xMin))) * w;
    return m.izq + ((v - xMin) / (xMax - xMin)) * w;
  };
  const ty = (v: number) =>
    logY
      ? m.sup + h - (Math.log2(Math.min(Math.max(v, 1), techo)) / Math.log2(techo)) * h
      : m.sup + h - ((Math.min(v, techo) - yMin) / (techo - yMin)) * h;
  const dash = (s: SerieLinea) => (s.trazo === "discontinua" ? "7 5" : s.trazo === "punteada" ? "2 5" : undefined);

  const mover = (e: EventoPuntero<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - caja.left;
    let mejor = xs[0];
    for (const x of xs) if (Math.abs(tx(x) - px) < Math.abs(tx(mejor) - px)) mejor = x;
    setFoco(mejor);
  };
  const valoresFoco =
    foco === null
      ? []
      : series
          .map((s) => ({ s, p: s.puntos.find((p) => p.x === foco) }))
          .filter((v): v is { s: SerieLinea; p: { x: number; y: number } } => !!v.p);

  return (
    <div className="grafica" ref={ref}>
      {leyenda && series.length > 1 && <Leyenda elementos={series.map((s) => ({ nombre: s.nombre, color: s.color, trazo: s.trazo }))} />}
      <div className="grafica-lienzo">
        <svg width={ancho} height={alto} role="img" aria-label={etiqueta} onPointerMove={mover} onPointerLeave={() => setFoco(null)}>
          {bandas.map((b, i) => (
            <g key={i}>
              <rect
                x={m.izq}
                width={w}
                y={ty(Math.min(b.hasta, techo))}
                height={Math.max(0, ty(b.desde) - ty(Math.min(b.hasta, techo)))}
                fill={b.color}
              />
              {b.texto && (
                <text x={m.izq + w - 6} y={ty(Math.min(b.hasta, techo)) + 14} textAnchor="end" className="grafica-banda">
                  {b.texto}
                </text>
              )}
            </g>
          ))}
          {ticksY.map((t) => (
            <g key={t}>
              <line x1={m.izq} x2={m.izq + w} y1={ty(t)} y2={ty(t)} className="grafica-rejilla" />
              <text x={m.izq - 8} y={ty(t) + 4} textAnchor="end" className="grafica-eje">
                {formatoY(t)}
              </text>
            </g>
          ))}
          {xs.map((x) => (
            <g key={x}>
              <line x1={tx(x)} x2={tx(x)} y1={m.sup} y2={m.sup + h} className="grafica-rejilla grafica-rejilla-v" />
              <text x={tx(x)} y={m.sup + h + 18} textAnchor="middle" className="grafica-eje">
                {formatoX(x)}
              </text>
            </g>
          ))}
          <line x1={m.izq} x2={m.izq + w} y1={m.sup + h} y2={m.sup + h} className="grafica-base" />
          {foco !== null && <line x1={tx(foco)} x2={tx(foco)} y1={m.sup} y2={m.sup + h} className="grafica-guia" />}
          {series.map((s) => (
            <g key={s.id}>
              <polyline
                points={s.puntos.map((p) => `${tx(p.x)},${ty(p.y)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={s.grosor ?? 2}
                strokeDasharray={dash(s)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.marcadores &&
                s.puntos.map((p) => (
                  <circle
                    key={p.x}
                    cx={tx(p.x)}
                    cy={ty(p.y)}
                    r={foco === p.x ? 5.5 : 4.5}
                    fill={s.color}
                    stroke="var(--hoja)"
                    strokeWidth="2"
                  />
                ))}
            </g>
          ))}
          <text x={m.izq + w / 2} y={alto - 6} textAnchor="middle" className="grafica-titulo-eje">
            {tituloX}
          </text>
          <text transform={`translate(13 ${m.sup + h / 2}) rotate(-90)`} textAnchor="middle" className="grafica-titulo-eje">
            {tituloY}
          </text>
        </svg>
        {foco !== null && valoresFoco.length > 0 && (
          <div className="grafica-info" style={{ left: Math.min(tx(foco) + 12, ancho - 190), top: m.sup + 4 }}>
            <strong>
              {tituloX}: {formatoX(foco)}
            </strong>
            {valoresFoco.map(({ s, p }) => (
              <span key={s.id}>
                <i style={{ background: s.color }} aria-hidden="true" />
                {s.nombre}: {formatoY(p.y)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Leyenda({ elementos }: { elementos: { nombre: string; color: string; trazo?: SerieLinea["trazo"] | "barra" }[] }) {
  return (
    <ul className="leyenda">
      {elementos.map((e) => (
        <li key={e.nombre}>
          {e.trazo === "barra" ? (
            <span className="leyenda-barra" style={{ background: e.color }} aria-hidden="true" />
          ) : (
            <svg width="22" height="10" aria-hidden="true">
              <line
                x1="1"
                x2="21"
                y1="5"
                y2="5"
                stroke={e.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={e.trazo === "discontinua" ? "6 4" : e.trazo === "punteada" ? "1.5 4" : undefined}
              />
            </svg>
          )}
          {e.nombre}
        </li>
      ))}
    </ul>
  );
}

interface SerieColumnas {
  id: string;
  nombre: string;
  color: string;
  valores: number[];
}

export function GraficaColumnas({
  categorias,
  series,
  etiqueta,
  alto = 220,
  tituloY,
  cadaN = 1,
  formatoCategoria = (c) => c,
}: {
  categorias: string[];
  series: SerieColumnas[];
  etiqueta: string;
  alto?: number;
  tituloY?: string;
  cadaN?: number;
  formatoCategoria?: (c: string) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ancho = useAncho(ref, 560);
  const [foco, setFoco] = useState<number | null>(null);
  const m = { izq: tituloY ? 46 : 34, der: 8, sup: 10, inf: 30 };
  const w = Math.max(120, ancho - m.izq - m.der);
  const h = alto - m.sup - m.inf;
  const totales = categorias.map((_, i) => series.reduce((s, x) => s + (x.valores[i] ?? 0), 0));
  const ticks = ticksAgradables(0, Math.max(1, ...totales), 4, totales.every(Number.isInteger));
  const techo = ticks[ticks.length - 1];
  const banda = w / Math.max(1, categorias.length);
  const anchoBarra = Math.max(2, Math.min(42, banda * 0.72));
  const ty = (v: number) => m.sup + h - (v / techo) * h;

  return (
    <div className="grafica" ref={ref}>
      {series.length > 1 && <Leyenda elementos={series.map((s) => ({ nombre: s.nombre, color: s.color, trazo: "barra" as const }))} />}
      <div className="grafica-lienzo">
        <svg width={ancho} height={alto} role="img" aria-label={etiqueta} onPointerLeave={() => setFoco(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.izq} x2={m.izq + w} y1={ty(t)} y2={ty(t)} className="grafica-rejilla" />
              <text x={m.izq - 8} y={ty(t) + 4} textAnchor="end" className="grafica-eje">
                {formatoPorDefecto(t)}
              </text>
            </g>
          ))}
          {categorias.map((c, i) => {
            let acumulado = 0;
            const x = m.izq + i * banda + (banda - anchoBarra) / 2;
            return (
              <g key={c} onPointerEnter={() => setFoco(i)}>
                <rect x={m.izq + i * banda} y={m.sup} width={banda} height={h} fill="transparent" />
                {series.map((s) => {
                  const v = s.valores[i] ?? 0;
                  const y0 = ty(acumulado);
                  acumulado += v;
                  const y1 = ty(acumulado);
                  if (v <= 0) return null;
                  return (
                    <rect
                      key={s.id}
                      x={x}
                      y={y1}
                      width={anchoBarra}
                      height={Math.max(0, y0 - y1 - (acumulado > v ? 1 : 0))}
                      rx="2"
                      fill={s.color}
                      opacity={foco === null || foco === i ? 1 : 0.55}
                    />
                  );
                })}
                {i % cadaN === 0 && (
                  <text x={x + anchoBarra / 2} y={m.sup + h + 18} textAnchor="middle" className="grafica-eje">
                    {formatoCategoria(c)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={m.izq} x2={m.izq + w} y1={m.sup + h} y2={m.sup + h} className="grafica-base" />
          {tituloY && (
            <text transform={`translate(12 ${m.sup + h / 2}) rotate(-90)`} textAnchor="middle" className="grafica-titulo-eje">
              {tituloY}
            </text>
          )}
        </svg>
        {foco !== null && (
          <div className="grafica-info" style={{ left: Math.min(m.izq + foco * banda + banda / 2 + 10, ancho - 190), top: 8 }}>
            <strong>{formatoCategoria(categorias[foco])}</strong>
            {series.map((s) => (
              <span key={s.id}>
                <i style={{ background: s.color }} aria-hidden="true" />
                {s.nombre}: {formatoPorDefecto(s.valores[foco] ?? 0)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BarrasHorizontales({
  filas,
  maximo,
  formato = formatoPorDefecto,
}: {
  filas: { clave: string; etiqueta: ReactNode; valor: number; color?: string; detalle?: ReactNode }[];
  maximo?: number;
  formato?: (v: number) => string;
}) {
  const tope = maximo ?? Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul className="barras-h">
      {filas.map((f) => (
        <li key={f.clave}>
          <span className="barras-h-etiqueta">{f.etiqueta}</span>
          <span className="barras-h-pista" aria-hidden="true">
            <span style={{ width: `${(f.valor / tope) * 100}%`, background: f.color ?? "var(--grafito)" }} />
          </span>
          <span className="barras-h-valor cifra">
            {formato(f.valor)}
            {f.detalle && <span className="meta barras-h-detalle">{f.detalle}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
