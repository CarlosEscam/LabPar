import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router";
import { Editor, type DiagnosticoEditor } from "../componentes/Editor";
import { Icono } from "../componentes/Icono";
import { Markdown } from "../componentes/Markdown";
import { useAvisar } from "../componentes/Notificaciones";
import { ProgresoEnvio, ResultadoEjecucion, ResultadoEvaluacion } from "../componentes/Resultados";
import { Cargando, ChipModelo, ChipNivel, Dialogo, ErrorCarga, Pestanas, Segmentado, Veredicto } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { registrarEvento } from "../lib/eventos";
import { ARCHIVO_FUENTE, fecha, haceCuanto, numero, plural, puntaje, unidad } from "../lib/formato";
import { terminado, useCarga, useDivisor, usePersistente, useSeguimientoEnvio, useTitulo } from "../lib/ganchos";
import { esPersonal, useUsuario } from "../lib/sesion";
import {
  esLabDocente,
  type Asignacion,
  type Borrador,
  type Curso,
  type Envio,
  type EnvioResumen,
  type EvaluacionPublica,
  type Laboratorio,
  type Modelo,
  type Objetivo,
} from "../lib/tipos";

const OPCIONES_P: Record<Modelo, number[]> = { openmp: [1, 2, 4, 8], mpi: [1, 2, 3, 4], cuda: [1] };

/** Texto con `código` en línea (preguntas y opciones del cuestionario). */
export function TextoEnLinea({ texto }: { texto: string }) {
  // String(): un laboratorio importado o mal escrito podría traer otro tipo; se muestra en vez de romper la página.
  const partes = String(texto ?? "").split(/(`[^`]+`)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

// ============================================================================= Página
export default function EspacioLaboratorio() {
  const { labId, cursoId } = useParams();
  const idLab = Number(labId);
  const idCurso = cursoId ? Number(cursoId) : null;
  const usuario = useUsuario();
  const personal = esPersonal(usuario);

  const carga = useCarga(
    async (senal) => {
      const [lab, borrador, curso, asignaciones] = await Promise.all([
        api<Laboratorio>(`/laboratorios/${idLab}`, { senal }),
        api<Borrador>(`/laboratorios/${idLab}/borrador`, { senal }),
        idCurso ? api<Curso>(`/cursos/${idCurso}`, { senal }) : Promise.resolve(null),
        idCurso && !personal ? api<Asignacion[]>(`/cursos/${idCurso}/asignaciones`, { senal }) : Promise.resolve([] as Asignacion[]),
      ]);
      return { lab, borrador, curso, asignacion: asignaciones.find((a) => a.laboratorio.id === idLab) ?? null };
    },
    [idLab, idCurso, personal],
  );
  useTitulo(carga.datos?.lab.titulo);

  if (carga.cargando && !carga.datos)
    return (
      <div className="contenedor pagina">
        <Cargando texto="Preparando el laboratorio…" />
      </div>
    );
  if (carga.error || !carga.datos)
    return (
      <div className="contenedor pagina">
        <ErrorCarga mensaje={carga.error ?? "No se pudo cargar el laboratorio."} reintentar={carga.recargar} />
      </div>
    );
  return <Espacio key={idLab} {...carga.datos} cursoId={idCurso} />;
}

// ============================================================================= Espacio de trabajo
interface PropsEspacio {
  lab: Laboratorio;
  borrador: Borrador;
  curso: Curso | null;
  asignacion: Asignacion | null;
  cursoId: number | null;
}

type EstadoGuardado =
  { tipo: "guardado"; en: string | null } | { tipo: "pendiente" } | { tipo: "guardando" } | { tipo: "error"; texto: string };

function Espacio({ lab, borrador, curso, asignacion: asignacionInicial, cursoId }: PropsEspacio) {
  const usuario = useUsuario();
  const personal = esPersonal(usuario);
  const avisar = useAvisar();
  const modelo = lab.modelo;

  // --- Código y autoguardado
  const [codigo, setCodigo] = useState(borrador.codigo ?? lab.plantilla);
  const [guardado, setGuardado] = useState<EstadoGuardado>({ tipo: "guardado", en: borrador.actualizado_en });
  const pendiente = useRef<string | null>(null);
  const guardar = useCallback(
    async (texto: string) => {
      pendiente.current = null;
      setGuardado({ tipo: "guardando" });
      try {
        const r = await api<Borrador>(`/laboratorios/${lab.id}/borrador`, { metodo: "PUT", cuerpo: { codigo: texto } });
        setGuardado({ tipo: "guardado", en: r.actualizado_en });
      } catch (e) {
        pendiente.current = texto;
        setGuardado({ tipo: "error", texto: mensaje(e) });
      }
    },
    [lab.id],
  );
  useEffect(() => {
    if (pendiente.current === null) return;
    const id = window.setTimeout(() => pendiente.current !== null && guardar(pendiente.current), 1200);
    return () => window.clearTimeout(id);
  }, [codigo, guardar]);
  useEffect(
    () => () => {
      // Al salir del laboratorio se guarda lo que falte (sin esperar la respuesta).
      if (pendiente.current !== null)
        void api(`/laboratorios/${lab.id}/borrador`, { metodo: "PUT", cuerpo: { codigo: pendiente.current } }).catch(() => {});
    },
    [lab.id],
  );
  const cambiarCodigo = useCallback((texto: string) => {
    setCodigo(texto);
    pendiente.current = texto;
    setGuardado({ tipo: "pendiente" });
  }, []);
  const reemplazarCodigo = (texto: string) => {
    cambiarCodigo(texto);
  };

  // --- Evento de apertura (analítica de aprendizaje)
  useEffect(() => {
    registrarEvento("lab_abierto", { laboratorio_id: lab.id, curso_id: cursoId ?? undefined });
  }, [lab.id, cursoId]);

  // --- Ejecución y evaluación
  const opcionesP = OPCIONES_P[modelo];
  const [p, setP] = usePersistente<number>(`labpar.p.${modelo}`, modelo === "mpi" ? 4 : modelo === "openmp" ? 4 : 1);
  const casosEjemplo = esLabDocente(lab) ? lab.casos : lab.casos_visibles;
  const [entrada, setEntrada] = useState(casosEjemplo[0]?.entrada ?? "");
  const [asignacion, setAsignacion] = useState(asignacionInicial);
  const [ejecucion, setEjecucion] = useState<Envio | null>(null);
  const [evaluacion, setEvaluacion] = useState<Envio | null>(null);
  const [pestanaDock, setPestanaDock] = useState<"ejecucion" | "evaluacion">("ejecucion");
  const [dockAbierto, setDockAbierto] = usePersistente("labpar.dock", true);
  const [enviando, setEnviando] = useState<"ejecucion" | "evaluacion" | null>(null);
  const [historialVersion, setHistorialVersion] = useState(0);
  const [irA, setIrA] = useState<{ linea: number } | null>(null);
  const [vistaMovil, setVistaMovil] = useState<"enunciado" | "codigo">("enunciado");

  const ejecucionViva = useSeguimientoEnvio(ejecucion);
  const evaluacionViva = useSeguimientoEnvio(evaluacion, (e) => {
    setHistorialVersion((v) => v + 1);
    if (cursoId && !personal) {
      api<Asignacion[]>(`/cursos/${cursoId}/asignaciones`)
        .then((lista) => setAsignacion(lista.find((a) => a.laboratorio.id === lab.id) ?? null))
        .catch(() => {});
    }
    if (e.veredicto === "aceptado") avisar(`Envío #${e.id} aceptado con ${puntaje(e.puntaje)} puntos.`);
  });

  const intentosRestantes = asignacion?.intentos_max ? asignacion.intentos_max - (asignacion.intentos ?? 0) : null;
  const ocupado = enviando !== null;
  const ejecucionEnCurso = !!ejecucionViva && !terminado(ejecucionViva);
  const evaluacionEnCurso = !!evaluacionViva && !terminado(evaluacionViva);

  const lanzar = async (tipo: "ejecucion" | "evaluacion") => {
    if (ocupado) return;
    setEnviando(tipo);
    if (pendiente.current !== null) void guardar(pendiente.current);
    try {
      const envio = await api<Envio>("/envios", {
        metodo: "POST",
        cuerpo: {
          laboratorio_id: lab.id,
          curso_id: cursoId ?? undefined,
          codigo,
          tipo,
          ...(tipo === "ejecucion" ? { hilos: modelo === "cuda" ? 1 : p, entrada } : {}),
        },
      });
      if (tipo === "ejecucion") setEjecucion(envio);
      else {
        setEvaluacion(envio);
        if (asignacion) setAsignacion({ ...asignacion, intentos: (asignacion.intentos ?? 0) + 1 });
      }
      setPestanaDock(tipo);
      setDockAbierto(true);
      setVistaMovil("codigo");
    } catch (e) {
      avisar(mensaje(e), "error");
    } finally {
      setEnviando(null);
    }
  };

  // Atajos: Ctrl+Enter ejecuta; Ctrl+Mayús+Enter envía a evaluación.
  const lanzarRef = useRef(lanzar);
  lanzarRef.current = lanzar;
  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void lanzarRef.current(e.shiftKey ? "evaluacion" : "ejecucion");
      }
    };
    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, []);

  // Diagnósticos del último intento que no compiló (se marcan en el editor)
  const diagnosticos = useMemo<DiagnosticoEditor[]>(() => {
    const fuente = pestanaDock === "evaluacion" ? evaluacionViva : ejecucionViva;
    const comp = fuente?.resultado?.compilacion;
    if (!comp) return [];
    return comp.diagnosticos
      .filter((d) => d.linea)
      .map((d) => ({
        linea: d.linea!,
        mensaje: d.explicacion ? `${d.mensaje}\n${d.explicacion}` : d.mensaje,
        severidad: d.tipo === "error" ? "error" : "warning",
      }));
  }, [ejecucionViva, evaluacionViva, pestanaDock]);

  const irALinea = useCallback((linea: number) => {
    setVistaMovil("codigo");
    setIrA({ linea });
  }, []);

  // --- Paneles redimensionables
  const [anchoEnunciado, iniciarArrastreX, ajustarX] = useDivisor("labpar.division.x", 0.4, "x", 0.24, 0.62);
  const [altoEditor, iniciarArrastreY, ajustarY] = useDivisor("labpar.division.y", 0.56, "y", 0.2, 0.85);

  const [confirmarPlantilla, setConfirmarPlantilla] = useState(false);
  const [confirmarSolucion, setConfirmarSolucion] = useState(false);

  const volverA = curso
    ? { ruta: `/cursos/${curso.id}`, texto: curso.nombre }
    : personal
      ? { ruta: "/laboratorios", texto: "Banco de laboratorios" }
      : { ruta: "/", texto: "Inicio" };
  const nombreP = modelo === "mpi" ? "Procesos" : "Hilos";

  return (
    <div className={`espacio vista-${vistaMovil}`} style={{ "--ancho-enunciado": `${anchoEnunciado * 100}%` } as CSSProperties}>
      <div className="espacio-movil" role="tablist" aria-label="Vista">
        <button role="tab" aria-selected={vistaMovil === "enunciado"} onClick={() => setVistaMovil("enunciado")}>
          Enunciado
        </button>
        <button role="tab" aria-selected={vistaMovil === "codigo"} onClick={() => setVistaMovil("codigo")}>
          Código y resultados
        </button>
      </div>

      {/* ------------------------------------------------------------------ Enunciado */}
      <section className="espacio-enunciado" aria-label="Enunciado del laboratorio">
        <PanelEnunciado
          lab={lab}
          volverA={volverA}
          cursoId={cursoId}
          asignacion={asignacion}
          personal={personal}
          historialVersion={historialVersion}
          alUsarEntrada={(texto) => {
            setEntrada(texto);
            setPestanaDock("ejecucion");
            setDockAbierto(true);
            setVistaMovil("codigo");
          }}
          alVerEnvio={async (id) => {
            try {
              const e = await api<Envio>(`/envios/${id}`);
              if (e.tipo === "evaluacion") {
                setEvaluacion(e);
                setPestanaDock("evaluacion");
              } else {
                setEjecucion(e);
                setPestanaDock("ejecucion");
              }
              setDockAbierto(true);
              setVistaMovil("codigo");
            } catch (err) {
              avisar(mensaje(err), "error");
            }
          }}
          alCargarCodigo={async (id) => {
            try {
              const r = await api<{ codigo: string }>(`/envios/${id}/codigo`);
              reemplazarCodigo(r.codigo);
              setVistaMovil("codigo");
              avisar(`Se cargó en el editor el código del envío #${id}.`, "info");
            } catch (err) {
              avisar(mensaje(err), "error");
            }
          }}
        />
      </section>

      <div
        className="divisor divisor-x"
        role="separator"
        aria-orientation="vertical"
        aria-label="Cambiar el ancho del enunciado"
        aria-valuenow={Math.round(anchoEnunciado * 100)}
        aria-valuemin={24}
        aria-valuemax={62}
        tabIndex={0}
        onPointerDown={iniciarArrastreX}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") ajustarX(-0.02);
          if (e.key === "ArrowRight") ajustarX(0.02);
        }}
      />

      {/* ------------------------------------------------------------------ Código y resultados */}
      <section
        className="espacio-codigo"
        aria-label="Código y resultados"
        style={{ "--alto-editor": `${altoEditor * 100}%` } as CSSProperties}
      >
        <div className="herramientas">
          <div className="herramientas-archivo">
            <span className="archivo">
              <Icono nombre="terminal" tamano={16} />
              {ARCHIVO_FUENTE[lab.lenguaje] ?? "programa.c"}
            </span>
            <EstadoDeGuardado estado={guardado} reintentar={() => pendiente.current !== null && guardar(pendiente.current)} />
          </div>
          <div className="herramientas-acciones">
            <button
              className="boton boton-sutil boton-icono"
              onClick={() => setConfirmarPlantilla(true)}
              title="Volver a la plantilla inicial"
              aria-label="Volver a la plantilla inicial"
            >
              <Icono nombre="restaurar" />
            </button>
            {esLabDocente(lab) && lab.solucion_docente && (
              <button
                className="boton boton-sutil boton-icono"
                onClick={() => setConfirmarSolucion(true)}
                title="Cargar la solución del docente"
                aria-label="Cargar la solución del docente"
              >
                <Icono nombre="ojo" />
              </button>
            )}
            {modelo !== "cuda" && (
              <div className="selector-p">
                <span className="meta" id="etiqueta-p">
                  {nombreP}
                </span>
                <Segmentado
                  opciones={opcionesP}
                  valor={opcionesP.includes(p) ? p : opcionesP[0]}
                  alCambiar={setP}
                  etiqueta={`${nombreP} para ejecutar`}
                />
              </div>
            )}
            <button
              className="boton boton-chico"
              onClick={() => lanzar("ejecucion")}
              disabled={ocupado || ejecucionEnCurso}
              title="Ejecutar con la entrada de la consola (Ctrl + Enter)"
            >
              <Icono nombre="ejecutar" tamano={16} />
              {ejecucionEnCurso ? "Ejecutando…" : "Ejecutar"}
            </button>
            <button
              className="boton boton-primario boton-chico"
              onClick={() => lanzar("evaluacion")}
              disabled={ocupado || evaluacionEnCurso || intentosRestantes === 0}
              title="Evaluar con todos los casos de prueba (Ctrl + Mayús + Enter)"
            >
              <Icono nombre="enviar" tamano={16} />
              {evaluacionEnCurso ? "Evaluando…" : "Enviar a evaluación"}
            </button>
          </div>
        </div>

        <div className={`editor-y-dock${dockAbierto ? "" : " dock-cerrado"}`}>
          <div className="zona-editor">
            <Editor valor={codigo} alCambiar={cambiarCodigo} diagnosticos={diagnosticos} irA={irA} etiqueta={`Código de ${lab.titulo}`} />
          </div>
          {dockAbierto && (
            <div
              className="divisor divisor-y"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Cambiar el alto del editor"
              aria-valuenow={Math.round(altoEditor * 100)}
              aria-valuemin={20}
              aria-valuemax={85}
              tabIndex={0}
              onPointerDown={iniciarArrastreY}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") ajustarY(-0.03);
                if (e.key === "ArrowDown") ajustarY(0.03);
              }}
            />
          )}
          <div className="dock">
            <div className="dock-cabeza">
              <div className="dock-pestanas" role="tablist" aria-label="Resultados">
                <button
                  role="tab"
                  aria-selected={pestanaDock === "ejecucion"}
                  onClick={() => {
                    setPestanaDock("ejecucion");
                    setDockAbierto(true);
                  }}
                >
                  Consola
                  {ejecucionViva && <MiniEstado envio={ejecucionViva} />}
                </button>
                <button
                  role="tab"
                  aria-selected={pestanaDock === "evaluacion"}
                  onClick={() => {
                    setPestanaDock("evaluacion");
                    setDockAbierto(true);
                  }}
                >
                  Evaluación
                  {evaluacionViva && <MiniEstado envio={evaluacionViva} />}
                </button>
              </div>
              <div className="fila" style={{ gap: 6 }}>
                {intentosRestantes !== null && (
                  <span className={`meta cifra${intentosRestantes <= 1 ? " fecha-pronto" : ""}`}>
                    {intentosRestantes > 0 ? `Te quedan ${plural(intentosRestantes, "intento")}` : "Usaste todos los intentos"}
                  </span>
                )}
                <button
                  className="boton boton-sutil boton-icono"
                  onClick={() => setDockAbierto(!dockAbierto)}
                  aria-label={dockAbierto ? "Contraer los resultados" : "Expandir los resultados"}
                  aria-expanded={dockAbierto}
                >
                  <Icono nombre="abajo" className={dockAbierto ? "" : "girar-180"} />
                </button>
              </div>
            </div>
            {dockAbierto && (
              <div className="dock-cuerpo">
                {pestanaDock === "ejecucion" ? (
                  <Consola
                    modelo={modelo}
                    p={p}
                    entrada={entrada}
                    setEntrada={setEntrada}
                    casos={casosEjemplo}
                    envio={ejecucionViva}
                    irALinea={irALinea}
                  />
                ) : evaluacionViva ? (
                  terminado(evaluacionViva) ? (
                    <ResultadoEvaluacion envio={evaluacionViva} alIrALinea={irALinea} />
                  ) : (
                    <ProgresoEnvio envio={evaluacionViva} />
                  )
                ) : (
                  <div className="dock-vacio">
                    <p>
                      <strong>Enviar a evaluación</strong> compila tu programa y lo ejecuta con todos los casos de prueba, incluidos los
                      ocultos, con varios valores de p. Si todos son correctos, mide la aceleración frente a una versión secuencial.
                    </p>
                    <p className="meta">Los resultados anteriores están en la pestaña Historial del enunciado.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <Dialogo
        abierto={confirmarPlantilla}
        alCerrar={() => setConfirmarPlantilla(false)}
        titulo="¿Volver a la plantilla?"
        descripcion="Se reemplazará el código del editor por la plantilla inicial del laboratorio. Tus envíos anteriores no cambian y puedes recuperarlos desde el historial."
        pie={
          <>
            <button className="boton boton-sutil" onClick={() => setConfirmarPlantilla(false)}>
              Cancelar
            </button>
            <button
              className="boton boton-primario"
              onClick={() => {
                reemplazarCodigo(lab.plantilla);
                setConfirmarPlantilla(false);
              }}
            >
              Usar la plantilla
            </button>
          </>
        }
      />
      {esLabDocente(lab) && (
        <Dialogo
          abierto={confirmarSolucion}
          alCerrar={() => setConfirmarSolucion(false)}
          titulo="¿Cargar la solución del docente?"
          descripcion="El editor mostrará la solución de referencia del laboratorio. Sirve para comprobar que el laboratorio y sus casos funcionan antes de asignarlo."
          pie={
            <>
              <button className="boton boton-sutil" onClick={() => setConfirmarSolucion(false)}>
                Cancelar
              </button>
              <button
                className="boton boton-primario"
                onClick={() => {
                  reemplazarCodigo(lab.solucion_docente);
                  setConfirmarSolucion(false);
                }}
              >
                Cargar la solución
              </button>
            </>
          }
        />
      )}
    </div>
  );
}

function MiniEstado({ envio }: { envio: Envio }) {
  if (!terminado(envio)) return <span className="giro giro-chico" aria-label="En curso" />;
  const v = envio.veredicto ?? envio.estado;
  const tono = v === "aceptado" || v === "ejecutado" ? "ok" : v === "tiempo_excedido" || v === "requisitos_incumplidos" ? "aviso" : "error";
  return <span className={`punto-estado punto-${tono}`} aria-hidden="true" />;
}

function EstadoDeGuardado({ estado, reintentar }: { estado: EstadoGuardado; reintentar: () => void }) {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => refrescar((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (estado.tipo === "error")
    return (
      <span className="estado-guardado guardado-error" role="status">
        No se pudo guardar.{" "}
        <button className="boton-enlace" onClick={reintentar}>
          Reintentar
        </button>
      </span>
    );
  const texto =
    estado.tipo === "guardando"
      ? "Guardando…"
      : estado.tipo === "pendiente"
        ? "Cambios sin guardar"
        : estado.en
          ? `Guardado ${haceCuanto(estado.en)}`
          : "Plantilla inicial";
  return (
    <span className="estado-guardado meta" role="status" aria-live="polite">
      {texto}
    </span>
  );
}

// ============================================================================= Consola (ejecución rápida)
function Consola({
  modelo,
  p,
  entrada,
  setEntrada,
  casos,
  envio,
  irALinea,
}: {
  modelo: Modelo;
  p: number;
  entrada: string;
  setEntrada: (v: string) => void;
  casos: { id: number; nombre: string; entrada: string }[];
  envio: Envio | null;
  irALinea: (linea: number) => void;
}) {
  const seleccionado = casos.find((c) => c.entrada === entrada)?.id ?? "";
  return (
    <div className="consola-ejecucion">
      <div className="consola-entrada">
        <div className="campo">
          <label htmlFor="entrada-ejecucion">Entrada (stdin)</label>
          {casos.length > 0 && (
            <select
              aria-label="Usar la entrada de un caso de ejemplo"
              value={seleccionado}
              onChange={(e) => {
                const c = casos.find((x) => x.id === Number(e.target.value));
                if (c) setEntrada(c.entrada);
              }}
            >
              <option value="">Entrada personalizada</option>
              {casos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
          <textarea
            id="entrada-ejecucion"
            className="mono"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            rows={4}
            spellCheck={false}
          />
          <span className="ayuda">
            {modelo === "cuda" ? "Se ejecuta en la GPU del nodo." : `Se ejecuta con ${p} ${unidad(modelo, p)}.`} Si la entrada coincide con
            un caso de ejemplo, se compara la salida con la esperada.
          </span>
        </div>
      </div>
      <div className="consola-salida">
        {!envio && (
          <div className="dock-vacio">
            <p>
              <strong>Ejecutar</strong> compila tu código y lo corre una vez con esta entrada. Úsalo para probar con distintos valores de p
              antes de enviar a evaluación.
            </p>
          </div>
        )}
        {envio && !terminado(envio) && <ProgresoEnvio envio={envio} />}
        {envio && terminado(envio) && <ResultadoEjecucion envio={envio} alIrALinea={irALinea} />}
      </div>
    </div>
  );
}

// ============================================================================= Panel del enunciado
type PestanaEnunciado = "enunciado" | "ejemplos" | "preguntas" | "historial";

function PanelEnunciado({
  lab,
  volverA,
  cursoId,
  asignacion,
  personal,
  historialVersion,
  alUsarEntrada,
  alVerEnvio,
  alCargarCodigo,
}: {
  lab: Laboratorio;
  volverA: { ruta: string; texto: string };
  cursoId: number | null;
  asignacion: Asignacion | null;
  personal: boolean;
  historialVersion: number;
  alUsarEntrada: (entrada: string) => void;
  alVerEnvio: (id: number) => void;
  alCargarCodigo: (id: number) => void;
}) {
  const [pestana, setPestana] = useState<PestanaEnunciado>("enunciado");
  const casos = esLabDocente(lab) ? lab.casos : lab.casos_visibles.map((c) => ({ ...c, visible: true, peso: 1, orden: 0 }));
  const pestanas: { id: PestanaEnunciado; texto: string; contador?: number }[] = [
    { id: "enunciado", texto: "Enunciado" },
    { id: "ejemplos", texto: personal ? "Casos" : "Ejemplos", contador: casos.length },
    ...(lab.preguntas.length ? [{ id: "preguntas" as const, texto: "Preguntas", contador: lab.preguntas.length }] : []),
    { id: "historial", texto: "Historial" },
  ];
  return (
    <div className="enunciado">
      <div className="enunciado-cabeza">
        <Link to={volverA.ruta} className="volver">
          <Icono nombre="izquierda" tamano={16} />
          {volverA.texto}
        </Link>
        <h1>{lab.titulo}</h1>
        <div className="fila">
          <ChipModelo modelo={lab.modelo} />
          <ChipNivel nivel={lab.nivel} />
          <span className="meta">{lab.duracion_estimada_min} min aprox.</span>
          {asignacion?.fecha_limite && <span className="meta">Fecha límite: {fecha(asignacion.fecha_limite)}</span>}
        </div>
        {personal && (
          <p className="nota-docente" role="note">
            <Icono nombre="ojo" tamano={16} />
            <span>
              Vista docente: puedes probar el laboratorio; tus envíos no cuentan en la analítica de los cursos.
              {esLabDocente(lab) && (
                <>
                  {" "}
                  {lab.puede_editar ? (
                    <Link to={`/laboratorios/${lab.id}/editar`}>Editar el laboratorio</Link>
                  ) : (
                    <Link to={`/laboratorios`}>Duplícalo desde el banco para adaptarlo</Link>
                  )}
                  .
                </>
              )}
            </span>
          </p>
        )}
        <Pestanas pestanas={pestanas} activa={pestana} alCambiar={setPestana} etiqueta="Secciones del laboratorio" />
      </div>
      <div className="enunciado-cuerpo" role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`pestana-${pestana}`} tabIndex={0}>
        {pestana === "enunciado" && <PestanaTexto lab={lab} />}
        {pestana === "ejemplos" && (
          <div className="pila">
            {casos.length === 0 && <p className="meta">Este laboratorio no tiene casos de ejemplo visibles.</p>}
            {casos.map((c) => (
              <article key={c.id} className="caso-ejemplo">
                <header>
                  <h3>{c.nombre}</h3>
                  {!c.visible && <span className="chip chip-borde">oculto para estudiantes</span>}
                  <button className="boton boton-chico" onClick={() => alUsarEntrada(c.entrada)}>
                    <Icono nombre="terminal" tamano={16} /> Probar en la consola
                  </button>
                </header>
                <div className="detalle-caso-io">
                  <div>
                    <span className="etiqueta-io">Entrada</span>
                    <pre className={`consola${c.entrada ? "" : " vacia"}`}>{c.entrada || "(vacía)"}</pre>
                  </div>
                  <div>
                    <span className="etiqueta-io">Salida esperada</span>
                    <pre className={`consola${c.salida_esperada ? "" : " vacia"}`}>{c.salida_esperada || "(vacía)"}</pre>
                  </div>
                </div>
              </article>
            ))}
            {!personal && lab.evaluacion.num_casos_ocultos > 0 && (
              <p className="meta">
                Además hay {plural(lab.evaluacion.num_casos_ocultos, "caso oculto", "casos ocultos")} que solo se usan al enviar a
                evaluación.
              </p>
            )}
          </div>
        )}
        {pestana === "preguntas" && <Cuestionario lab={lab} cursoId={cursoId} />}
        {pestana === "historial" && (
          <Historial
            labId={lab.id}
            cursoId={cursoId}
            personal={personal}
            version={historialVersion}
            alVer={alVerEnvio}
            alCargar={alCargarCodigo}
          />
        )}
      </div>
    </div>
  );
}

function PestanaTexto({ lab }: { lab: Laboratorio }) {
  const objetivos = lab.objetivos.map((o) => (typeof o === "string" ? { texto: o } : (o as Objetivo)));
  return (
    <div className="pila" style={{ gap: 24 }}>
      {objetivos.length > 0 && (
        <section className="objetivos" aria-labelledby="titulo-objetivos">
          <h2 id="titulo-objetivos">Al terminar podrás</h2>
          <ul>
            {objetivos.map((o, i) => (
              <li key={i}>
                {o.nivel && <span className="nivel-bloom">{o.nivel}</span>}
                {o.texto}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Markdown texto={lab.enunciado_md} />
      <ComoSeEvalua ev={lab.evaluacion} modelo={lab.modelo} />
      {lab.pistas.length > 0 && <Pistas lab={lab} />}
    </div>
  );
}

const COMPARACION: Record<EvaluacionPublica["comparacion"], string> = {
  exacta: "la salida debe coincidir carácter por carácter (se ignoran los espacios al final)",
  tokens: "se comparan las palabras y los números, sin importar espacios ni saltos de línea",
  numerica: "los números se comparan con una tolerancia relativa",
};

function ComoSeEvalua({ ev, modelo }: { ev: EvaluacionPublica; modelo: Modelo }) {
  const pesoTotal = ev.peso_correccion + ev.peso_rendimiento;
  const pc = pesoTotal ? Math.round((ev.peso_correccion / pesoTotal) * 100) : 100;
  const u = (n: number) => unidad(modelo, n);
  return (
    <section className="como-se-evalua" aria-labelledby="titulo-evaluacion">
      <h2 id="titulo-evaluacion">Cómo se evalúa</h2>
      <dl>
        <div>
          <dt>Corrección, {pc} %</dt>
          <dd>
            {plural(ev.num_casos, "caso de prueba", "casos de prueba")}
            {ev.num_casos_ocultos > 0 && ` (${ev.num_casos_ocultos} ocultos)`}
            {modelo === "cuda"
              ? ", ejecutados en la GPU"
              : `, cada uno con ${ev.hilos_correccion.join(", ").replace(/, (\d+)$/, " y $1")} ${u(2)} y ${plural(ev.repeticiones_correccion, "repetición", "repeticiones")}`}
            . Para comparar, {COMPARACION[ev.comparacion]}.
          </dd>
        </div>
        {ev.peso_rendimiento > 0 && ev.mide_rendimiento && (
          <div>
            <dt>Rendimiento, {100 - pc} %</dt>
            <dd>
              {modelo === "cuda"
                ? `Aceleración frente a una versión secuencial en CPU; el objetivo es S ≥ ${numero(ev.aceleracion_objetivo ?? 5, 0)}.`
                : `Aceleración frente a una versión secuencial con p = ${ev.hilos_rendimiento.join(", ")}; el objetivo es una eficiencia E ≥ ${numero(ev.eficiencia_objetivo ?? 0.6, 2)} con el mayor p.`}{" "}
              Solo se mide cuando todos los casos son correctos.
            </dd>
          </div>
        )}
        {(ev.requisitos.length > 0 || ev.prohibidos.length > 0) && (
          <div>
            <dt>Requisitos</dt>
            <dd>
              <ul>
                {ev.requisitos.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {ev.prohibidos.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              Si no se cumplen, el puntaje máximo es 50.
            </dd>
          </div>
        )}
        <div>
          <dt>Límites</dt>
          <dd>
            {numero(ev.tiempo_limite_s, 0)} s por ejecución y memoria acotada; el programa corre aislado en un nodo de la Universidad.
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Pistas({ lab }: { lab: Laboratorio }) {
  const [vistas, setVistas] = usePersistente<number>(`labpar.pistas.${lab.id}`, 0);
  return (
    <section className="pistas" aria-labelledby="titulo-pistas">
      <h2 id="titulo-pistas">Pistas</h2>
      {vistas > 0 && (
        <ol>
          {lab.pistas.slice(0, vistas).map((p, i) => (
            <li key={i}>
              <TextoEnLinea texto={p} />
            </li>
          ))}
        </ol>
      )}
      {vistas < lab.pistas.length ? (
        <button
          className="boton boton-chico"
          onClick={() => {
            registrarEvento("pista_vista", { laboratorio_id: lab.id, datos: { indice: vistas + 1 } });
            setVistas(vistas + 1);
          }}
        >
          <Icono nombre="bombilla" tamano={16} />
          {vistas === 0 ? "Ver una pista" : "Ver otra pista"} ({vistas + 1} de {lab.pistas.length})
        </button>
      ) : (
        <p className="meta">Ya viste todas las pistas.</p>
      )}
    </section>
  );
}

function Cuestionario({ lab, cursoId }: { lab: Laboratorio; cursoId: number | null }) {
  const [respuestas, setRespuestas] = usePersistente<Record<number, number>>(`labpar.cuestionario.${lab.id}`, {});
  const correctas = lab.preguntas.filter((q, i) => respuestas[i] === q.correcta).length;
  const respondidas = Object.keys(respuestas).length;
  return (
    <div className="cuestionario">
      <p className="meta">
        Preguntas de repaso para comprobar los conceptos del laboratorio. No afectan tu puntaje.
        {respondidas > 0 && ` Llevas ${correctas} de ${respondidas} correctas.`}
      </p>
      {lab.preguntas.map((q, i) => {
        const elegida = respuestas[i];
        const respondida = elegida !== undefined;
        return (
          <fieldset key={i} className="pregunta">
            <legend>
              <span className="pregunta-numero">{i + 1}.</span> <TextoEnLinea texto={q.pregunta} />
            </legend>
            <div className="opciones">
              {q.opciones.map((o, j) => {
                const clase = respondida
                  ? j === q.correcta
                    ? "opcion opcion-correcta"
                    : j === elegida
                      ? "opcion opcion-incorrecta"
                      : "opcion"
                  : "opcion";
                return (
                  <label key={j} className={clase}>
                    <input
                      type="radio"
                      name={`pregunta-${lab.id}-${i}`}
                      checked={elegida === j}
                      disabled={respondida}
                      onChange={() => {
                        setRespuestas({ ...respuestas, [i]: j });
                        registrarEvento("cuestionario_respondido", {
                          laboratorio_id: lab.id,
                          curso_id: cursoId ?? undefined,
                          datos: { pregunta: i + 1, correcta: j === q.correcta },
                        });
                      }}
                    />
                    <span>
                      <TextoEnLinea texto={o} />
                    </span>
                    {respondida && j === q.correcta && <Icono nombre="check" tamano={16} grosor={2.6} etiqueta="Respuesta correcta" />}
                    {respondida && j === elegida && j !== q.correcta && (
                      <Icono nombre="cruz" tamano={16} grosor={2.6} etiqueta="Tu respuesta" />
                    )}
                  </label>
                );
              })}
            </div>
            {respondida && q.explicacion && (
              <p className={`explicacion ${elegida === q.correcta ? "explicacion-ok" : "explicacion-error"}`}>
                <strong>{elegida === q.correcta ? "Correcto. " : "No es la respuesta. "}</strong>
                <TextoEnLinea texto={q.explicacion} />
              </p>
            )}
          </fieldset>
        );
      })}
      {respondidas > 0 && (
        <button className="boton boton-chico boton-sutil" onClick={() => setRespuestas({})}>
          <Icono nombre="restaurar" tamano={16} /> Responder de nuevo
        </button>
      )}
    </div>
  );
}

function Historial({
  labId,
  cursoId,
  personal,
  version,
  alVer,
  alCargar,
}: {
  labId: number;
  cursoId: number | null;
  personal: boolean;
  version: number;
  alVer: (id: number) => void;
  alCargar: (id: number) => void;
}) {
  const usuario = useUsuario();
  const consulta = personal
    ? `/envios?laboratorio_id=${labId}&usuario_id=${usuario.id}&tipo=todos&limite=40`
    : `/envios?laboratorio_id=${labId}&tipo=todos&limite=40`;
  const envios = useCarga((senal) => api<EnvioResumen[]>(consulta, { senal }), [consulta, version]);
  const [soloEvaluaciones, setSoloEvaluaciones] = useState(true);
  if (envios.cargando && !envios.datos) return <Cargando />;
  if (envios.error) return <ErrorCarga mensaje={envios.error} reintentar={envios.recargar} />;
  const lista = (envios.datos ?? []).filter(
    (e) => (cursoId === null || personal || e.curso_id === cursoId) && (!soloEvaluaciones || e.tipo === "evaluacion"),
  );
  return (
    <div className="pila">
      <label className="casilla">
        <input type="checkbox" checked={!soloEvaluaciones} onChange={(e) => setSoloEvaluaciones(!e.target.checked)} />
        <span>Incluir las ejecuciones de la consola</span>
      </label>
      {lista.length === 0 ? (
        <p className="meta">{soloEvaluaciones ? "Todavía no has enviado este laboratorio a evaluación." : "Todavía no hay ejecuciones."}</p>
      ) : (
        <ol className="historial">
          {lista.map((e) => (
            <li key={e.id}>
              <div className="historial-fila">
                <button className="historial-principal" onClick={() => alVer(e.id)}>
                  <span className="historial-id cifra">#{e.id}</span>
                  <Veredicto clave={e.estado === "completado" ? e.veredicto : e.estado} />
                  <span className="meta">
                    {e.tipo === "ejecucion" ? `Consola, p = ${(e.parametros?.hilos as number) ?? 1}` : haceCuanto(e.creado_en)}
                  </span>
                </button>
                <span className="historial-cifras cifra">
                  {e.tipo === "evaluacion" && e.puntaje !== null && <span title="Puntaje">{puntaje(e.puntaje)} pts</span>}
                  {e.aceleracion !== null && <span title="Aceleración con el mayor p">S = {numero(e.aceleracion)}</span>}
                </span>
                <button className="boton boton-sutil boton-chico" onClick={() => alCargar(e.id)} title="Cargar este código en el editor">
                  <Icono nombre="subir" tamano={15} />
                  <span className="solo-ancho">Cargar</span>
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
