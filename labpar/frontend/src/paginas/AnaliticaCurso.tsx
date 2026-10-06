import { useRef, useState } from "react";
import { BarrasHorizontales, GraficaColumnas } from "../componentes/Graficas";
import { Icono } from "../componentes/Icono";
import { useAvisar } from "../componentes/Notificaciones";
import { Aviso, Cargando, ChipModelo, ErrorCarga, Vacio } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { fechaCorta, numero, porcentaje, puntaje, veredicto } from "../lib/formato";
import { useAncho, useCarga } from "../lib/ganchos";
import { aceptabilidad, ITEMS_SUS } from "../lib/sus";
import type { Analitica, Curso, PruebaT, ResumenEstadistico } from "../lib/tipos";

const COLOR_TONO = {
  ok: "var(--ok)",
  error: "var(--error)",
  aviso: "var(--aviso)",
  neutro: "var(--tenue)",
  proceso: "var(--tenue)",
} as const;

function valorP(p: number): string {
  return p < 0.001 ? "p < 0,001" : `p = ${numero(p, 3)}`;
}

// ============================================================================= Analítica de aprendizaje
export function PanelAnalitica({ cursoId }: { cursoId: number }) {
  const datos = useCarga((senal) => api<Analitica>(`/cursos/${cursoId}/analitica`, { senal }), [cursoId]);
  if (datos.cargando && !datos.datos) return <Cargando />;
  if (datos.error || !datos.datos) return <ErrorCarga mensaje={datos.error ?? "Error"} reintentar={datos.recargar} />;
  const a = datos.datos;
  const r = a.resumen;
  if (r.evaluaciones + r.ejecuciones === 0)
    return (
      <Vacio titulo="Todavía no hay actividad">
        La analítica se llena a medida que los estudiantes ejecutan y envían sus programas. Mientras tanto, revisa que el curso tenga
        laboratorios asignados.
      </Vacio>
    );

  return (
    <div className="analitica">
      <dl className="cifras">
        <div>
          <dt>Estudiantes activos</dt>
          <dd className="cifra">
            {r.estudiantes_activos} <span className="tenue">de {r.estudiantes}</span>
          </dd>
        </div>
        <div>
          <dt>Envíos a evaluación</dt>
          <dd className="cifra">{r.evaluaciones}</dd>
        </div>
        <div>
          <dt>Ejecuciones en consola</dt>
          <dd className="cifra">{r.ejecuciones}</dd>
        </div>
        <div>
          <dt>Laboratorios aceptados</dt>
          <dd className="cifra">
            {porcentaje(r.pares_totales ? r.pares_aceptados / r.pares_totales : 0)}{" "}
            <span className="tenue">
              ({r.pares_aceptados} de {r.pares_totales})
            </span>
          </dd>
        </div>
      </dl>

      <section className="seccion-analitica">
        <h3>Actividad de los últimos 30 días</h3>
        <GraficaColumnas
          etiqueta="Envíos por día en los últimos 30 días"
          categorias={a.envios_por_dia.map((d) => d.fecha)}
          formatoCategoria={(c) => fechaCorta(`${c}T12:00:00`)}
          cadaN={5}
          series={[
            { id: "eval", nombre: "Envíos a evaluación", color: "var(--tinta)", valores: a.envios_por_dia.map((d) => d.evaluaciones) },
            {
              id: "ejec",
              nombre: "Ejecuciones en consola",
              color: "var(--linea-fuerte)",
              valores: a.envios_por_dia.map((d) => d.ejecuciones),
            },
          ]}
        />
      </section>

      <div className="rejilla-2">
        <section className="seccion-analitica">
          <h3>Resultados de las evaluaciones</h3>
          <BarrasHorizontales
            formato={(v) => String(v)}
            filas={a.veredictos.map((v) => {
              const d = veredicto(v.veredicto);
              return { clave: v.veredicto, etiqueta: d.etiqueta, valor: v.n, color: COLOR_TONO[d.tono] };
            })}
          />
        </section>
        <section className="seccion-analitica">
          <h3>Mejor puntaje por estudiante y laboratorio</h3>
          <GraficaColumnas
            etiqueta="Distribución de los mejores puntajes"
            alto={200}
            categorias={a.distribucion_puntajes.map((_, i) => (i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`))}
            series={[{ id: "n", nombre: "Pares estudiante–laboratorio", color: "var(--grafito)", valores: a.distribucion_puntajes }]}
            formatoCategoria={(c) => c.split("–")[0]}
          />
        </section>
      </div>

      <section className="seccion-analitica">
        <h3>Dificultades más frecuentes</h3>
        <p className="meta">Retroalimentación que recibieron los envíos (una vez por envío). Útil para decidir qué reforzar en clase.</p>
        {a.retro_frecuente.length === 0 ? (
          <p className="meta">Sin errores ni sugerencias registrados.</p>
        ) : (
          <BarrasHorizontales
            formato={(v) => (v === 1 ? "1 envío" : `${v} envíos`)}
            filas={a.retro_frecuente.map((x) => ({
              clave: x.codigo,
              etiqueta: x.titulo,
              valor: x.n,
              color: "var(--grafito)",
              detalle: `(${x.estudiantes === 1 ? "1 estudiante" : `${x.estudiantes} estudiantes`})`,
            }))}
          />
        )}
      </section>

      <section className="seccion-analitica">
        <h3>Por laboratorio</h3>
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th>Laboratorio</th>
                <th className="num">Con intentos</th>
                <th className="num">Aceptados</th>
                <th className="num">Envíos</th>
                <th className="num">Puntaje medio</th>
                <th className="num" title="Mediana de la mejor aceleración de cada estudiante">
                  S mediana
                </th>
                <th className="num" title="Mediana de minutos desde que abrió el laboratorio hasta su primer envío aceptado">
                  Minutos hasta aceptar
                </th>
                <th className="num">Envíos hasta aceptar</th>
              </tr>
            </thead>
            <tbody>
              {a.por_laboratorio.map((l) => (
                <tr key={l.laboratorio.id}>
                  <td>
                    <div className="fila" style={{ gap: 8, flexWrap: "nowrap" }}>
                      <ChipModelo modelo={l.laboratorio.modelo} />
                      <span>{l.laboratorio.titulo}</span>
                    </div>
                  </td>
                  <td className="num">{l.estudiantes_con_intentos}</td>
                  <td className="num">{l.aceptados}</td>
                  <td className="num">{l.intentos}</td>
                  <td className="num">{puntaje(l.puntaje_medio)}</td>
                  <td className="num">{l.mediana_aceleracion !== null ? numero(l.mediana_aceleracion) : "—"}</td>
                  <td className="num">{l.mediana_minutos_hasta_aceptado !== null ? numero(l.mediana_minutos_hasta_aceptado, 1) : "—"}</td>
                  <td className="num">{l.mediana_envios_hasta_aceptado !== null ? numero(l.mediana_envios_hasta_aceptado, 1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ============================================================================= Encuesta SUS
export function PanelEncuesta({ curso, fijarCurso }: { curso: Curso; fijarCurso: (c: Curso) => void }) {
  const avisar = useAvisar();
  const datos = useCarga((senal) => api<Analitica>(`/cursos/${curso.id}/analitica`, { senal }), [curso.id]);
  const [cambiando, setCambiando] = useState(false);
  const alternar = async () => {
    setCambiando(true);
    try {
      const c = await api<Curso>(`/cursos/${curso.id}`, { metodo: "PATCH", cuerpo: { encuesta_sus_activa: !curso.encuesta_sus_activa } });
      fijarCurso(c);
      avisar(c.encuesta_sus_activa ? "Encuesta activada: los estudiantes la verán en su inicio." : "Encuesta cerrada.");
    } catch (e) {
      avisar(mensaje(e), "error");
    } finally {
      setCambiando(false);
    }
  };
  const sus = datos.datos?.sus;

  return (
    <div className="pila" style={{ gap: 24 }}>
      <section className="interruptor-encuesta">
        <div>
          <h3>Encuesta de usabilidad (SUS)</h3>
          <p className="meta">
            Diez afirmaciones con escala de 1 a 5. Cada estudiante la responde una vez por curso. Actívala al final de la fase de evaluación
            (hipótesis H2: el puntaje medio supera 70).
          </p>
        </div>
        <label className="interruptor">
          <input type="checkbox" role="switch" checked={curso.encuesta_sus_activa} onChange={alternar} disabled={cambiando} />
          <span>{curso.encuesta_sus_activa ? "Activa" : "Cerrada"}</span>
        </label>
      </section>

      {datos.cargando && !datos.datos && <Cargando />}
      {datos.error && <ErrorCarga mensaje={datos.error} reintentar={datos.recargar} />}
      {sus && sus.resumen.n === 0 && (
        <Vacio titulo="Aún no hay respuestas">
          {curso.encuesta_sus_activa
            ? "Las respuestas aparecerán aquí a medida que los estudiantes completen la encuesta."
            : "Activa la encuesta para que los estudiantes puedan responderla."}
        </Vacio>
      )}
      {sus && sus.resumen.n > 0 && (
        <>
          <ResumenSUS resumen={sus.resumen} prueba={sus.prueba_t} mu0={sus.mu0} />
          <section className="seccion-analitica">
            <h3>Distribución de los puntajes</h3>
            <GraficaColumnas
              etiqueta="Histograma de puntajes SUS"
              alto={190}
              categorias={sus.histograma.map((_, i) => (i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`))}
              series={[{ id: "n", nombre: "Respuestas", color: "var(--grafito)", valores: sus.histograma }]}
              formatoCategoria={(c) => c.split("–")[0]}
            />
          </section>
        </>
      )}
      <details className="plegable">
        <summary>Afirmaciones del cuestionario</summary>
        <ol className="contenido items-sus">
          {ITEMS_SUS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function ResumenSUS({ resumen, prueba, mu0 }: { resumen: ResumenEstadistico; prueba: PruebaT | null; mu0: number }) {
  const media = resumen.media ?? 0;
  const nivel = aceptabilidad(media);
  let conclusion: string;
  if (!prueba) conclusion = "Se necesitan al menos dos respuestas para contrastar la hipótesis.";
  else if (prueba.p === null || prueba.t === null) conclusion = prueba.nota ?? "La prueba no es aplicable con estos datos.";
  else {
    const estadistico = `t(${prueba.gl}) = ${numero(prueba.t, 2)}, ${valorP(prueba.p)}, d = ${numero(prueba.d ?? 0, 2)}`;
    conclusion = prueba.significativa
      ? `La media es significativamente mayor que ${mu0} (${estadistico}): se rechaza H₀₂ con α = 0,05.`
      : `No hay evidencia suficiente de que la media supere ${mu0} (${estadistico}): no se rechaza H₀₂.`;
  }
  return (
    <section className="resumen-sus">
      <dl className="cifras">
        <div>
          <dt>Respuestas</dt>
          <dd className="cifra">{resumen.n}</dd>
        </div>
        <div>
          <dt>Media</dt>
          <dd className="cifra">
            {numero(resumen.media, 1)} <span className={`chip chip-${nivel.tono}`}>{nivel.texto}</span>
          </dd>
        </div>
        <div>
          <dt>Desviación estándar</dt>
          <dd className="cifra">{numero(resumen.de, 1)}</dd>
        </div>
        <div>
          <dt>Intervalo de confianza 95 %</dt>
          <dd className="cifra">{resumen.ic95 ? `${numero(resumen.ic95[0], 1)} a ${numero(resumen.ic95[1], 1)}` : "—"}</dd>
        </div>
      </dl>
      <EscalaAceptabilidad media={media} ic={resumen.ic95} mu0={mu0} />
      <Aviso tono={prueba?.significativa ? "ok" : "info"} titulo="Hipótesis H2">
        {conclusion}
      </Aviso>
    </section>
  );
}

function EscalaAceptabilidad({ media, ic, mu0 }: { media: number; ic: [number, number] | null; mu0: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const ancho = useAncho(ref, 640);
  const m = { izq: 12, der: 12 };
  const w = Math.max(200, ancho - m.izq - m.der);
  const x = (v: number) => m.izq + (Math.min(100, Math.max(0, v)) / 100) * w;
  const bandas = [
    { desde: 0, hasta: 50, color: "var(--error-suave)", texto: "No aceptable" },
    { desde: 50, hasta: 70, color: "var(--aviso-suave)", texto: "Marginal" },
    { desde: 70, hasta: 100, color: "var(--ok-suave)", texto: "Aceptable" },
  ];
  return (
    <div ref={ref} className="escala-sus">
      <svg
        width={ancho}
        height={92}
        role="img"
        aria-label={`Puntaje SUS medio ${numero(media, 1)} sobre 100${ic ? `, intervalo de confianza de ${numero(ic[0], 1)} a ${numero(ic[1], 1)}` : ""}`}
      >
        {bandas.map((b) => (
          <g key={b.texto}>
            <rect x={x(b.desde)} y={20} width={x(b.hasta) - x(b.desde)} height={26} fill={b.color} />
            <text x={(x(b.desde) + x(b.hasta)) / 2} y={14} textAnchor="middle" className="grafica-eje">
              {b.texto}
            </text>
          </g>
        ))}
        {[0, 25, 50, 70, 100].map((t) => (
          <text key={t} x={x(t)} y={64} textAnchor="middle" className="grafica-eje">
            {t}
          </text>
        ))}
        <line x1={x(mu0)} x2={x(mu0)} y1={16} y2={50} stroke="var(--tinta)" strokeWidth="1.5" strokeDasharray="3 3" />
        {ic && <line x1={x(ic[0])} x2={x(ic[1])} y1={33} y2={33} stroke="var(--tinta)" strokeWidth="2" />}
        {ic && <line x1={x(ic[0])} x2={x(ic[0])} y1={27} y2={39} stroke="var(--tinta)" strokeWidth="2" />}
        {ic && <line x1={x(ic[1])} x2={x(ic[1])} y1={27} y2={39} stroke="var(--tinta)" strokeWidth="2" />}
        <circle cx={x(media)} cy={33} r={6} fill="var(--tinta)" stroke="var(--hoja)" strokeWidth="2" />
        <text x={x(media)} y={84} textAnchor="middle" className="grafica-titulo-eje">
          Media {numero(media, 1)}
        </text>
      </svg>
      <p className="meta">
        <Icono nombre="info" tamano={14} className="en-linea" /> Rangos de aceptabilidad de Bangor, Kortum y Miller. La línea punteada marca{" "}
        {mu0}, el valor de referencia de la hipótesis.
      </p>
    </div>
  );
}
