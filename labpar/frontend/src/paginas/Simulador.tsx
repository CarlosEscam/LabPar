import { useEffect, useMemo, useRef, useState } from "react";
import { GraficaLineas } from "../componentes/Graficas";
import { Markdown } from "../componentes/Markdown";
import { Segmentado } from "../componentes/UI";
import { registrarEvento } from "../lib/eventos";
import { numero } from "../lib/formato";
import { useTitulo } from "../lib/ganchos";

// Simulador de las leyes de Amdahl (problema fijo) y Gustafson (problema que crece con p),
// con un estimador de la fracción serial a partir de una medición (métrica de Karp–Flatt).

const amdahl = (f: number, p: number) => 1 / (f + (1 - f) / p);
const gustafson = (f: number, p: number) => p - f * (p - 1);
const P_MAXIMOS = [8, 16, 64, 256, 1024] as const;

const FORMULAS = String.raw`$$S_{\text{Amdahl}}(p) = \frac{1}{f + \dfrac{1-f}{p}} \qquad S_{\text{Gustafson}}(p) = p - f\,(p-1) \qquad E(p) = \frac{S(p)}{p}$$`;

export default function Simulador() {
  useTitulo("Simulador de aceleración");
  const [porcentajeSerial, setPorcentajeSerial] = useState(5);
  const [pMax, setPMax] = useState<(typeof P_MAXIMOS)[number]>(64);
  const [costoComunicacion, setCostoComunicacion] = useState(0);
  const f = porcentajeSerial / 100;
  const registrado = useRef(false);

  useEffect(() => {
    if (registrado.current) return;
    if (porcentajeSerial !== 5 || pMax !== 64 || costoComunicacion !== 0) {
      registrado.current = true;
      registrarEvento("simulador_usado");
    }
  }, [porcentajeSerial, pMax, costoComunicacion]);

  const ps = useMemo(() => {
    const lista: number[] = [];
    for (let p = 1; p <= pMax; p *= 2) lista.push(p);
    return lista;
  }, [pMax]);
  // Modelo con sobrecarga: cada duplicación de p añade un costo de comunicación (fracción del tiempo secuencial).
  const conSobrecarga = (p: number) => 1 / (f + (1 - f) / p + (costoComunicacion / 100) * Math.log2(p));

  const series = [
    {
      id: "ideal",
      nombre: "Ideal, S = p",
      color: "var(--grafito)",
      trazo: "discontinua" as const,
      grosor: 1.5,
      puntos: ps.map((p) => ({ x: p, y: p })),
    },
    {
      id: "gustafson",
      nombre: "Gustafson",
      color: "var(--tenue)",
      trazo: "punteada" as const,
      grosor: 2.5,
      puntos: ps.map((p) => ({ x: p, y: gustafson(f, p) })),
    },
    { id: "amdahl", nombre: "Amdahl", color: "var(--tinta)", marcadores: true, puntos: ps.map((p) => ({ x: p, y: amdahl(f, p) })) },
    ...(costoComunicacion > 0
      ? [
          {
            id: "sobrecarga",
            nombre: "Amdahl con comunicación",
            color: "var(--aviso)",
            marcadores: true,
            puntos: ps.map((p) => ({ x: p, y: conSobrecarga(p) })),
          },
        ]
      : []),
  ];
  const eficiencias = series
    .filter((s) => s.id !== "ideal")
    .map((s) => ({ ...s, puntos: s.puntos.map((pt) => ({ x: pt.x, y: pt.y / pt.x })) }));

  const limite = f > 0 ? 1 / f : Infinity;
  const sMax = amdahl(f, pMax);
  // p a partir del cual la eficiencia de Amdahl cae por debajo de 0,5: E = 1/(f·p + 1 − f) < 0,5  ⇔  p > (1 + f)/f
  const pMitad = f > 0 ? Math.ceil((1 + f) / f) : Infinity;
  const mejorConSobrecarga =
    costoComunicacion > 0 ? ps.reduce((mejor, p) => (conSobrecarga(p) > conSobrecarga(mejor) ? p : mejor), 1) : null;

  return (
    <div className="contenedor pagina simulador">
      <div className="encabezado">
        <div>
          <h1>Simulador de aceleración</h1>
          <p className="descripcion">
            Explora cuánto puede acelerar un programa según la fracción que no se puede paralelizar. Compara la ley de Amdahl (el problema
            no cambia de tamaño) con la de Gustafson (el problema crece con el número de procesadores).
          </p>
        </div>
      </div>

      <div className="simulador-rejilla">
        <aside className="simulador-controles panel" aria-label="Parámetros">
          <div className="campo">
            <label htmlFor="sim-f">
              Fracción serial <span className="cifra">f = {numero(porcentajeSerial, porcentajeSerial % 1 ? 1 : 0)} %</span>
            </label>
            <input
              id="sim-f"
              type="range"
              min={0}
              max={50}
              step={0.5}
              value={porcentajeSerial}
              onChange={(e) => setPorcentajeSerial(Number(e.target.value))}
            />
            <span className="ayuda">
              Parte del tiempo secuencial que no se puede repartir: lectura de la entrada, inicialización, reducción final.
            </span>
          </div>
          <div className="campo">
            <span className="etiqueta" id="sim-p">
              Procesadores hasta
            </span>
            <Segmentado opciones={P_MAXIMOS} valor={pMax} alCambiar={setPMax} etiqueta="Número máximo de procesadores" />
          </div>
          <div className="campo">
            <label htmlFor="sim-c">
              Costo de comunicación <span className="cifra">{numero(costoComunicacion, 1)} %</span>
            </label>
            <input
              id="sim-c"
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={costoComunicacion}
              onChange={(e) => setCostoComunicacion(Number(e.target.value))}
            />
            <span className="ayuda">Sobrecarga que se suma cada vez que se duplica p (por ejemplo, una reducción en árbol con MPI).</span>
          </div>
          <EstimadorKarpFlatt alUsar={(e) => setPorcentajeSerial(Math.min(50, Math.max(0, Math.round(e * 2000) / 20)))} />
        </aside>

        <div className="pila" style={{ gap: 28 }}>
          <dl className="cifras">
            <div>
              <dt>Límite de Amdahl, 1/f</dt>
              <dd className="cifra">{Number.isFinite(limite) ? numero(limite, 1) : "Sin límite"}</dd>
            </div>
            <div>
              <dt>Aceleración con p = {pMax}</dt>
              <dd className="cifra">{numero(sMax, 1)}</dd>
            </div>
            <div>
              <dt>Eficiencia con p = {pMax}</dt>
              <dd className="cifra">{numero(sMax / pMax, 2)}</dd>
            </div>
            <div>
              <dt>Gustafson con p = {pMax}</dt>
              <dd className="cifra">{numero(gustafson(f, pMax), 1)}</dd>
            </div>
          </dl>
          <p className="lectura-simulador">
            {f === 0
              ? "Sin fracción serial, la aceleración crece igual que el número de procesadores. En la práctica siempre hay algo de trabajo secuencial."
              : `Con f = ${numero(porcentajeSerial, porcentajeSerial % 1 ? 1 : 0)} %, ningún número de procesadores supera una aceleración de ${numero(limite, 1)}. La eficiencia cae por debajo de 0,5 a partir de p = ${pMitad}: desde ahí, más de la mitad de la capacidad de cada procesador se desperdicia.`}
            {mejorConSobrecarga !== null &&
              ` Con el costo de comunicación, la mejor aceleración se obtiene con p = ${mejorConSobrecarga}; agregar más procesadores la reduce.`}
          </p>
          <section>
            <h2 className="titulo-grafica">Aceleración</h2>
            <GraficaLineas
              etiqueta={`Aceleración según Amdahl y Gustafson para f = ${porcentajeSerial} %`}
              xs={ps}
              escalaX="log2"
              escalaY="log2"
              tituloX="Procesadores (p)"
              tituloY="Aceleración S (escala logarítmica)"
              alto={320}
              formatoY={(v) => numero(v, 0)}
              series={series}
            />
          </section>
          <section>
            <h2 className="titulo-grafica">Eficiencia</h2>
            <GraficaLineas
              etiqueta="Eficiencia según el número de procesadores"
              xs={ps}
              escalaX="log2"
              yMax={1}
              tituloX="Procesadores (p)"
              tituloY="Eficiencia E"
              alto={240}
              formatoY={(v) => numero(v, 1)}
              series={eficiencias}
            />
          </section>
          <Markdown texto={FORMULAS} className="formulas" />
        </div>
      </div>
    </div>
  );
}

function EstimadorKarpFlatt({ alUsar }: { alUsar: (e: number) => void }) {
  const [p, setP] = useState(4);
  const [s, setS] = useState(3);
  const valido = p >= 2 && s > 0;
  const e = valido ? (1 / s - 1 / p) / (1 - 1 / p) : null;
  return (
    <fieldset className="estimador">
      <legend className="etiqueta">Estimar f desde una medición</legend>
      <p className="ayuda">
        Escribe la aceleración que obtuviste en un laboratorio. La métrica de Karp–Flatt estima la fracción serial efectiva, que incluye la
        sobrecarga.
      </p>
      <div className="campos-2">
        <div className="campo">
          <label htmlFor="kf-p">p</label>
          <input id="kf-p" type="number" min={2} max={1024} value={p} onChange={(ev) => setP(Number(ev.target.value))} />
        </div>
        <div className="campo">
          <label htmlFor="kf-s">S medida</label>
          <input id="kf-s" type="number" min={0.01} step={0.01} value={s} onChange={(ev) => setS(Number(ev.target.value))} />
        </div>
      </div>
      <p className="cifra">
        e = {e === null ? "—" : numero(e, 3)}
        {e !== null && e < 0 && <span className="meta"> (superlineal: posible efecto de caché)</span>}
      </p>
      <button type="button" className="boton boton-chico" disabled={e === null || e < 0 || e > 0.5} onClick={() => e !== null && alUsar(e)}>
        Usar como fracción serial
      </button>
    </fieldset>
  );
}
