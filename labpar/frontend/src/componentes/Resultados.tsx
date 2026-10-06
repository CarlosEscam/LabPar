import { Fragment, useEffect, useState } from "react";
import { fecha, NOMBRE_MODELO, numero, puntaje as fmtPuntaje, segundos, unidad, VEREDICTO_CASO } from "../lib/formato";
import type { CasoResultado, Compilacion, Envio, Modelo, NivelRetro, Rendimiento, Requisito, Retro, VeredictoCaso } from "../lib/tipos";
import { GraficaLineas } from "./Graficas";
import { Icono, type NombreIcono } from "./Icono";
import { Carriles } from "./Marca";
import { Aviso, Veredicto } from "./UI";

type IrALinea = (linea: number) => void;

// ----------------------------------------------------------------------------- Retroalimentación
const ICONO_NIVEL: Record<NivelRetro, NombreIcono> = {
  error: "exclamacion",
  advertencia: "alerta",
  sugerencia: "bombilla",
  logro: "trofeo",
  info: "info",
};

function TextoRetro({ mensaje }: { mensaje: string }) {
  // El motor separa las sugerencias concretas con «•»: se muestran como lista.
  const [principal, ...vinetas] = mensaje.split(/\s*•\s+/);
  return (
    <>
      <p>{principal}</p>
      {vinetas.length > 0 && (
        <ul>
          {vinetas.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ListaRetro({ retro, alIrALinea }: { retro: Retro[]; alIrALinea?: IrALinea }) {
  if (retro.length === 0) return null;
  return (
    <ul className="retro">
      {retro.map((r, i) => (
        <li key={`${r.codigo}-${i}`} className={`retro-item retro-${r.nivel}`}>
          <span className="retro-icono">
            <Icono nombre={ICONO_NIVEL[r.nivel]} etiqueta={r.nivel} />
          </span>
          <div className="retro-texto">
            <div className="retro-titulo">
              <strong>{r.titulo}</strong>
              {r.linea && alIrALinea && (
                <button className="boton-enlace meta" onClick={() => alIrALinea(r.linea!)}>
                  Ir a la línea {r.linea}
                </button>
              )}
            </div>
            <TextoRetro mensaje={r.mensaje} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------- Compilación
export function DiagnosticosCompilacion({ compilacion, alIrALinea }: { compilacion: Compilacion; alIrALinea?: IrALinea }) {
  const errores = compilacion.diagnosticos.filter((d) => d.tipo === "error");
  const advertencias = compilacion.diagnosticos.filter((d) => d.tipo === "advertencia");
  return (
    <div className="pila" style={{ gap: 12 }}>
      {[...errores, ...advertencias].length > 0 && (
        <ul className="diagnosticos">
          {[...errores, ...advertencias].map((d, i) => (
            <li key={i} className={d.tipo === "error" ? "diag-error" : "diag-aviso"}>
              <div className="diag-cabeza">
                <span className="diag-tipo">{d.tipo === "error" ? "Error" : "Advertencia"}</span>
                {d.linea ? (
                  alIrALinea ? (
                    <button className="boton-enlace" onClick={() => alIrALinea(d.linea!)}>
                      línea {d.linea}
                      {d.columna ? `, columna ${d.columna}` : ""}
                    </button>
                  ) : (
                    <span>línea {d.linea}</span>
                  )
                ) : (
                  <span>enlazador</span>
                )}
              </div>
              <code className="diag-mensaje">{d.mensaje}</code>
              {d.explicacion && <p className="diag-explicacion">{d.explicacion}</p>}
            </li>
          ))}
        </ul>
      )}
      <details className="plegable">
        <summary>Salida completa del compilador</summary>
        <div className="contenido pila" style={{ gap: 8 }}>
          <code className="meta">{compilacion.comando}</code>
          <pre className={`consola${compilacion.salida ? "" : " vacia"}`}>{compilacion.salida || "Sin mensajes."}</pre>
        </div>
      </details>
    </div>
  );
}

// ----------------------------------------------------------------------------- Matriz de ejecuciones
const ICONO_CASO: Record<VeredictoCaso, NombreIcono | null> = {
  AC: "check",
  WA: "cruz",
  TLE: "reloj",
  RE: "exclamacion",
  OMITIDO: null,
};

function Celda({ v, p, rep, modelo }: { v: VeredictoCaso; p: number; rep: number; modelo: Modelo }) {
  const icono = ICONO_CASO[v];
  const texto = `${VEREDICTO_CASO[v].etiqueta} con ${p} ${unidad(modelo, p)}, ejecución ${rep}`;
  return (
    <span className={`celda celda-${v}`} title={texto} role="img" aria-label={texto}>
      {icono && <Icono nombre={icono} tamano={12} grosor={3} />}
    </span>
  );
}

export function MatrizEjecuciones({ casos, modelo }: { casos: CasoResultado[]; modelo: Modelo }) {
  const valoresP = [...new Set(casos.flatMap((c) => c.ejecuciones.map((e) => e.p)))].sort((a, b) => a - b);
  const [abierto, setAbierto] = useState<number | null>(() => {
    const i = casos.findIndex((c) => !c.aprobado);
    return i >= 0 ? i : null;
  });
  const reps = Math.max(1, ...casos.flatMap((c) => c.ejecuciones.map((e) => e.rep)));

  return (
    <div className="matriz">
      <table>
        <thead>
          <tr>
            <th scope="col">Caso de prueba</th>
            {valoresP.map((p) => (
              <th key={p} scope="col" className="matriz-p">
                {modelo === "cuda" ? "GPU" : `p = ${p}`}
              </th>
            ))}
            <th scope="col">
              <span className="oculto-visual">Detalle</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {casos.map((c, i) => (
            <Fragment key={`${c.id}-${i}`}>
              <tr className={c.aprobado ? "" : "matriz-falla"}>
                <th scope="row">
                  <span className="matriz-caso">
                    {c.nombre}
                    {!c.visible && <span className="chip chip-borde">oculto</span>}
                    {c.peso !== 1 && <span className="meta">peso {numero(c.peso, c.peso % 1 ? 1 : 0)}</span>}
                  </span>
                </th>
                {valoresP.map((p) => {
                  const ejecuciones = c.ejecuciones.filter((e) => e.p === p);
                  return (
                    <td key={p}>
                      <span className="matriz-celdas">
                        {Array.from({ length: reps }, (_, r) => {
                          const e = ejecuciones.find((x) => x.rep === r + 1);
                          return e ? (
                            <Celda key={r} v={e.veredicto} p={p} rep={r + 1} modelo={modelo} />
                          ) : (
                            <span key={r} className="celda celda-vacia" />
                          );
                        })}
                      </span>
                    </td>
                  );
                })}
                <td className="matriz-accion">
                  {!c.aprobado && (
                    <button
                      className="boton-enlace meta"
                      aria-expanded={abierto === i}
                      onClick={() => setAbierto(abierto === i ? null : i)}
                    >
                      {abierto === i ? "Ocultar" : "Ver detalle"}
                    </button>
                  )}
                </td>
              </tr>
              {abierto === i && !c.aprobado && (
                <tr className="matriz-detalle">
                  <td colSpan={valoresP.length + 2}>
                    <DetalleCaso caso={c} modelo={modelo} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <ul className="matriz-leyenda" aria-label="Convenciones">
        {(["AC", "WA", "TLE", "RE", "OMITIDO"] as VeredictoCaso[]).map((v) => (
          <li key={v}>
            <span className={`celda celda-${v}`} aria-hidden="true">
              {ICONO_CASO[v] && <Icono nombre={ICONO_CASO[v]!} tamano={12} grosor={3} />}
            </span>
            {VEREDICTO_CASO[v].etiqueta}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetalleCaso({ caso, modelo }: { caso: CasoResultado; modelo: Modelo }) {
  const d = caso.detalle;
  const distintos = Object.entries(caso.salidas_distintas ?? {})
    .filter(([, v]) => v)
    .map(([p]) => Number(p));
  return (
    <div className="detalle-caso">
      {d && (
        <p>
          Primera falla: {VEREDICTO_CASO[d.veredicto].etiqueta.toLowerCase()} con {d.p} {unidad(modelo, d.p)} (ejecución {d.rep}).
          {distintos.length > 0 && ` Con p = ${distintos.join(" y ")} hubo salidas distintas entre repeticiones.`}
        </p>
      )}
      {caso.entrada === null ? (
        <p className="meta">Es un caso oculto: no se muestran su entrada ni la salida esperada.</p>
      ) : (
        <div className="detalle-caso-io">
          <div>
            <span className="etiqueta-io">Entrada</span>
            <pre className="consola">{caso.entrada || "(vacía)"}</pre>
          </div>
          <div>
            <span className="etiqueta-io">Salida esperada</span>
            <pre className="consola">{caso.esperada || "(vacía)"}</pre>
          </div>
          {d?.stdout !== null && d?.stdout !== undefined && (
            <div>
              <span className="etiqueta-io">Tu salida</span>
              <pre className={`consola${d.stdout ? "" : " vacia"}`}>{d.stdout || "El programa no imprimió nada."}</pre>
            </div>
          )}
        </div>
      )}
      {d?.comparacion && !d.comparacion.ok && d.comparacion.esperado !== null && d.comparacion.esperado !== undefined && (
        <p>
          En la línea {d.comparacion.linea} se esperaba <code>{d.comparacion.esperado}</code> y se obtuvo{" "}
          <code>{d.comparacion.obtenido ?? "nada"}</code>.
        </p>
      )}
      {d?.comparacion?.detalle && <p className="meta">{d.comparacion.detalle}</p>}
      {d?.stderr && (
        <div>
          <span className="etiqueta-io">Salida de errores</span>
          <pre className="consola">{d.stderr}</pre>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------- Rendimiento
const esPotenciaDeDos = (n: number) => n > 0 && (n & (n - 1)) === 0;

export function GraficaAceleracion({ rendimiento: r, modelo }: { rendimiento: Rendimiento; modelo: Modelo }) {
  if (!r.medido || !r.puntos?.length) {
    return <p className="meta">{r.motivo ?? "El rendimiento no se midió en este envío."}</p>;
  }
  const puntos = r.puntos;
  const fuente =
    r.fuente_tiempo === "interno"
      ? "Tiempo medido dentro del programa (línea LABPAR_TIEMPO)"
      : "Tiempo total del proceso (no se encontró la línea LABPAR_TIEMPO)";
  const nota = `${fuente}; se toma el mínimo de ${r.repeticiones} repeticiones con el nodo en uso exclusivo. Referencia secuencial: ${segundos(r.t_referencia_s)}.`;

  if (modelo === "cuda" || puntos.length < 2) {
    const p = puntos[0];
    return (
      <div className="pila" style={{ gap: 12 }}>
        <dl className="cifras">
          <div>
            <dt>Tiempo de tu programa</dt>
            <dd className="cifra">{segundos(p.tiempo_s)}</dd>
          </div>
          <div>
            <dt>Versión secuencial en CPU</dt>
            <dd className="cifra">{segundos(r.t_referencia_s)}</dd>
          </div>
          <div>
            <dt>Aceleración S</dt>
            <dd className="cifra">{numero(p.aceleracion)}</dd>
          </div>
          <div>
            <dt>Objetivo</dt>
            <dd className="cifra">S ≥ {numero(r.objetivo_aceleracion ?? 1, 1)}</dd>
          </div>
        </dl>
        <p className="meta">{nota}</p>
      </div>
    );
  }

  const ps = puntos.map((p) => p.p);
  const pMax = Math.max(...ps);
  const eObj = r.eficiencia_objetivo ?? 0.6;
  const yMax = Math.max(pMax, ...puntos.map((p) => p.aceleracion)) * 1.08;
  const color = `var(--${modelo === "openmp" ? "omp" : modelo})`;
  return (
    <div className="pila aceleracion" style={{ gap: 14 }}>
      <GraficaLineas
        etiqueta={`Aceleración de tu programa frente al número de ${unidad(modelo, 2)}: con p = ${pMax}, S = ${numero(r.aceleracion_max)}`}
        xs={ps}
        escalaX={ps.every(esPotenciaDeDos) ? "log2" : "lineal"}
        yMax={yMax}
        tituloX={`${unidad(modelo, 2)[0].toUpperCase()}${unidad(modelo, 2).slice(1)} (p)`}
        tituloY="Aceleración S"
        formatoY={(v) => numero(v, v % 1 ? 1 : 0)}
        series={[
          {
            id: "ideal",
            nombre: "Ideal, S = p",
            color: "var(--grafito)",
            trazo: "discontinua",
            puntos: ps.map((p) => ({ x: p, y: p })),
            grosor: 1.5,
          },
          {
            id: "objetivo",
            nombre: `Objetivo, E = ${numero(eObj, 2)}`,
            color: "var(--aviso)",
            trazo: "punteada",
            puntos: ps.map((p) => ({ x: p, y: Math.max(1, eObj * p) })),
          },
          { id: "medida", nombre: "Tu programa", color, marcadores: true, puntos: puntos.map((p) => ({ x: p.p, y: p.aceleracion })) },
        ]}
      />
      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr>
              <th>p</th>
              <th className="num">Tiempo</th>
              <th className="num">Aceleración S</th>
              <th className="num">Eficiencia E</th>
              <th className="num" title="Fracción serial estimada con la métrica de Karp–Flatt">
                Fracción serial e
              </th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.p}>
                <td className="cifra">
                  {p.p} {unidad(modelo, p.p)}
                </td>
                <td className="num">{segundos(p.tiempo_s)}</td>
                <td className="num">{numero(p.aceleracion)}</td>
                <td className="num">{numero(p.eficiencia)}</td>
                <td className="num">{p.karp_flatt === null ? "—" : numero(p.karp_flatt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">{nota}</p>
    </div>
  );
}

function ListaRequisitos({ requisitos }: { requisitos: Requisito[] }) {
  return (
    <ul className="requisitos">
      {requisitos.map((r, i) => (
        <li key={i} className={r.cumplido ? "cumplido" : "incumplido"}>
          <Icono nombre={r.cumplido ? "check" : "cruz"} tamano={16} grosor={2.6} etiqueta={r.cumplido ? "Cumplido" : "No cumplido"} />
          <span>
            {r.tipo === "prohibido" && <span className="meta">No permitido: </span>}
            {r.mensaje}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------- Evaluación completa
export function ResultadoEvaluacion({ envio, alIrALinea }: { envio: Envio; alIrALinea?: IrALinea }) {
  const r = envio.resultado;
  if (!r) return null;
  const modelo = (r.modelo ?? "openmp") as Modelo;
  const pt = r.puntaje;
  const retro = r.retroalimentacion ?? [];
  const retroSinCompilacion = r.veredicto === "error_compilacion" ? retro.filter((x) => x.codigo !== "COMPILACION") : retro;

  return (
    <div className="resultado">
      <header className="resultado-cabeza">
        <div className="pila" style={{ gap: 6 }}>
          <Veredicto clave={r.veredicto} grande />
          <div className="resultado-meta meta">
            <span>
              Envío #{envio.id} del {fecha(envio.finalizado_en ?? envio.creado_en)}
            </span>
            {r.duracion_s !== undefined && (
              <span>
                Evaluado en {segundos(r.duracion_s)}
                {r.nodo ? ` en el nodo ${r.nodo}` : ""}
              </span>
            )}
            {Boolean(envio.parametros?.tardio) && <span className="fecha-vencida">Enviado después de la fecha límite</span>}
          </div>
        </div>
        {pt && (
          <div className="puntaje-bloque">
            <div className="puntaje-grande">
              <span className="cifra">{fmtPuntaje(pt.total)}</span>
              <span className="puntaje-de">de 100</span>
            </div>
            <dl className="puntaje-partes">
              <div>
                <dt>Corrección</dt>
                <dd className="cifra">
                  {fmtPuntaje(pt.correccion)}
                  <span className="tenue">
                    {" "}
                    / {fmtPuntaje(pt.rendimiento_evaluable ? (pt.peso_correccion / (pt.peso_correccion + pt.peso_rendimiento)) * 100 : 100)}
                  </span>
                </dd>
              </div>
              {pt.rendimiento_evaluable && (
                <div>
                  <dt>Rendimiento</dt>
                  <dd className="cifra">
                    {fmtPuntaje(pt.rendimiento)}
                    <span className="tenue"> / {fmtPuntaje((pt.peso_rendimiento / (pt.peso_correccion + pt.peso_rendimiento)) * 100)}</span>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </header>
      {pt?.nota && <p className="meta resultado-nota">{pt.nota}</p>}

      {r.veredicto === "error_compilacion" && r.compilacion && (
        <section className="resultado-seccion">
          <h3>El código no compila</h3>
          <DiagnosticosCompilacion compilacion={r.compilacion} alIrALinea={alIrALinea} />
        </section>
      )}

      {retroSinCompilacion.length > 0 && (
        <section className="resultado-seccion">
          <h3>Retroalimentación</h3>
          <ListaRetro retro={retroSinCompilacion} alIrALinea={alIrALinea} />
        </section>
      )}

      {r.correccion && r.correccion.casos.length > 0 && (
        <section className="resultado-seccion">
          <h3>
            Casos de prueba{" "}
            <span className="meta cifra">
              {r.correccion.casos.filter((c) => c.aprobado).length} de {r.correccion.casos.length} correctos
            </span>
          </h3>
          <MatrizEjecuciones casos={r.correccion.casos} modelo={modelo} />
        </section>
      )}

      {r.rendimiento && r.veredicto !== "error_compilacion" && (
        <section className="resultado-seccion">
          <h3>Rendimiento {modelo === "cuda" ? "frente a la CPU" : `con ${NOMBRE_MODELO[modelo]}`}</h3>
          <GraficaAceleracion rendimiento={r.rendimiento} modelo={modelo} />
        </section>
      )}

      {r.requisitos && r.requisitos.length > 0 && (
        <section className="resultado-seccion">
          <h3>Requisitos del laboratorio</h3>
          <ListaRequisitos requisitos={r.requisitos} />
        </section>
      )}

      {r.compilacion && r.veredicto !== "error_compilacion" && (
        <section className="resultado-seccion">
          <details className="plegable">
            <summary>Compilación ({segundos(r.compilacion.tiempo_s)})</summary>
            <div className="contenido pila" style={{ gap: 8 }}>
              <code className="meta">{r.compilacion.comando}</code>
              <pre className={`consola${r.compilacion.salida ? "" : " vacia"}`}>{r.compilacion.salida || "Compiló sin mensajes."}</pre>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------- Ejecución rápida
export function ResultadoEjecucion({ envio, alIrALinea }: { envio: Envio; alIrALinea?: IrALinea }) {
  const r = envio.resultado;
  if (!r) return null;
  const modelo = (r.modelo ?? "openmp") as Modelo;
  const retro = (r.retroalimentacion ?? []).filter((x) => x.nivel !== "logro");
  if (r.veredicto === "error_compilacion" && r.compilacion) {
    return (
      <div className="resultado">
        <header className="resultado-cabeza">
          <Veredicto clave="error_compilacion" grande />
        </header>
        <DiagnosticosCompilacion compilacion={r.compilacion} alIrALinea={alIrALinea} />
      </div>
    );
  }
  const comp = r.comparacion_ejemplo;
  return (
    <div className="resultado">
      <header className="resultado-cabeza">
        <div className="pila" style={{ gap: 6 }}>
          <Veredicto clave={r.veredicto} grande />
          {r.tiempo_s !== undefined && (
            <p className="meta">
              {modelo === "cuda" ? "En la GPU" : `Con ${r.p} ${unidad(modelo, r.p ?? 1)}`}, {segundos(r.tiempo_s)} en total
              {r.tiempo_interno_s !== null && r.tiempo_interno_s !== undefined ? `; región medida: ${segundos(r.tiempo_interno_s)}` : ""}.
            </p>
          )}
        </div>
      </header>
      {comp && (
        <Aviso tono={comp.ok ? "ok" : "error"}>
          {comp.ok ? (
            <>La salida coincide con la esperada en «{comp.caso}».</>
          ) : (
            <>
              La salida no coincide con la esperada en «{comp.caso}»
              {comp.esperado !== null && comp.esperado !== undefined ? (
                <>
                  : en la línea {comp.linea} se esperaba <code>{comp.esperado}</code> y se obtuvo <code>{comp.obtenido ?? "nada"}</code>.
                </>
              ) : (
                "."
              )}
            </>
          )}
        </Aviso>
      )}
      {retro.length > 0 && <ListaRetro retro={retro} alIrALinea={alIrALinea} />}
      {r.veredicto !== "no_disponible" && (
        <div className="salidas">
          <div>
            <span className="etiqueta-io">Salida estándar</span>
            <pre className={`consola${r.stdout ? "" : " vacia"}`}>{r.stdout || "El programa no imprimió nada."}</pre>
          </div>
          <div>
            <span className="etiqueta-io">Salida de errores</span>
            <pre className={`consola${r.stderr ? "" : " vacia"}`}>{r.stderr || "Sin mensajes."}</pre>
          </div>
        </div>
      )}
      {r.entrada !== undefined && (
        <details className="plegable">
          <summary>Entrada usada</summary>
          <div className="contenido">
            <pre className={`consola${r.entrada ? "" : " vacia"}`}>{r.entrada || "(vacía)"}</pre>
          </div>
        </details>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------- Envío en curso
export function ProgresoEnvio({ envio }: { envio: Envio }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const desde = new Date(envio.iniciado_en ?? envio.creado_en).getTime();
  const transcurrido = Math.max(0, Math.round((ahora - desde) / 1000));
  const evaluacion = envio.tipo === "evaluacion";
  return (
    <div className="progreso-envio" role="status" aria-live="polite">
      <Carriles />
      <div className="pila" style={{ gap: 4 }}>
        <strong>
          {envio.estado === "pendiente"
            ? envio.posicion_cola && envio.posicion_cola > 1
              ? `En cola: hay ${envio.posicion_cola - 1} ${envio.posicion_cola - 1 === 1 ? "trabajo" : "trabajos"} antes del tuyo`
              : "En cola: el tuyo es el siguiente"
            : evaluacion
              ? "Evaluando en el nodo de cómputo"
              : "Compilando y ejecutando"}
        </strong>
        <span className="meta cifra">
          {envio.estado === "ejecutando" && evaluacion
            ? `Compilación, casos de prueba con varios valores de p y medición de la aceleración. ${transcurrido} s`
            : `${transcurrido} s`}
        </span>
      </div>
    </div>
  );
}
