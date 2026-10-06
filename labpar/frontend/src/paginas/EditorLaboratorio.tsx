import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { Editor } from "../componentes/Editor";
import { Icono } from "../componentes/Icono";
import { Markdown } from "../componentes/Markdown";
import { useAvisar } from "../componentes/Notificaciones";
import { ProgresoEnvio, ResultadoEvaluacion } from "../componentes/Resultados";
import { Aviso, Cargando, ChipModelo, Dialogo, ErrorCarga, Pestanas, Veredicto } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { NOMBRE_MODELO, numero, plural, segundos } from "../lib/formato";
import { terminado, useCarga, useSeguimientoEnvio, useTitulo } from "../lib/ganchos";
import { CONFIG_POR_DEFECTO, ENUNCIADO_POR_DEFECTO, NIVELES_BLOOM, PLANTILLAS, REFERENCIA_POR_DEFECTO } from "../lib/plantillas";
import type { Caso, Envio, LabDocente, Lenguaje, Modelo, Nivel, Objetivo, Pregunta } from "../lib/tipos";

type Seccion = "general" | "enunciado" | "codigo" | "evaluacion" | "casos" | "apoyo";
type Regla = { patron: string; mensaje: string };

interface Formulario {
  titulo: string;
  slug: string;
  modelo: Modelo;
  lenguaje: Lenguaje;
  nivel: Nivel;
  orden: number;
  resumen: string;
  enunciado_md: string;
  plantilla: string;
  solucion_referencia: string;
  solucion_docente: string;
  config: Record<string, unknown>;
  objetivos: Objetivo[];
  conceptos: string[];
  preguntas: Pregunta[];
  pistas: string[];
  duracion_estimada_min: number;
  publicado: boolean;
}

/** Quita las opciones vacías y ajusta el índice de la respuesta correcta para que siga apuntando a la misma opción. */
function limpiarPregunta(q: Pregunta): Pregunta {
  const opciones = q.opciones.map((texto, indice) => ({ texto: texto.trim(), indice })).filter((o) => o.texto);
  const correcta = opciones.findIndex((o) => o.indice === q.correcta);
  return {
    pregunta: q.pregunta.trim(),
    opciones: opciones.map((o) => o.texto),
    correcta: correcta < 0 ? 0 : correcta,
    explicacion: (q.explicacion ?? "").trim(),
  };
}

function formularioNuevo(): Formulario {
  return {
    titulo: "",
    slug: "",
    modelo: "openmp",
    lenguaje: "c",
    nivel: "basico",
    orden: 100,
    resumen: "",
    enunciado_md: ENUNCIADO_POR_DEFECTO,
    plantilla: PLANTILLAS.openmp,
    solucion_referencia: REFERENCIA_POR_DEFECTO,
    solucion_docente: "",
    config: {},
    objetivos: [{ nivel: "Aplicar", texto: "" }],
    conceptos: [],
    preguntas: [],
    pistas: [],
    duracion_estimada_min: 45,
    publicado: false,
  };
}

function desdeLab(l: LabDocente): Formulario {
  return {
    titulo: l.titulo,
    slug: l.slug,
    modelo: l.modelo,
    lenguaje: l.lenguaje,
    nivel: l.nivel,
    orden: l.orden,
    resumen: l.resumen,
    enunciado_md: l.enunciado_md,
    plantilla: l.plantilla,
    solucion_referencia: l.solucion_referencia,
    solucion_docente: l.solucion_docente,
    config: { ...(l.config ?? {}) },
    objetivos: l.objetivos.map((o) => (typeof o === "string" ? { texto: o } : o)),
    conceptos: l.conceptos.map(String),
    preguntas: l.preguntas,
    pistas: l.pistas,
    duracion_estimada_min: l.duracion_estimada_min,
    publicado: l.publicado,
  };
}

export default function EditorLaboratorio() {
  const { labId } = useParams();
  const nuevo = !labId;
  const id = labId ? Number(labId) : null;
  const carga = useCarga((senal) => (id ? api<LabDocente>(`/laboratorios/${id}`, { senal }) : Promise.resolve(null)), [id]);
  useTitulo(nuevo ? "Nuevo laboratorio" : carga.datos ? `Editar: ${carga.datos.titulo}` : "Editar laboratorio");
  if (!nuevo && carga.cargando && !carga.datos)
    return (
      <div className="contenedor pagina">
        <Cargando />
      </div>
    );
  if (carga.error)
    return (
      <div className="contenedor pagina">
        <ErrorCarga mensaje={carga.error} reintentar={carga.recargar} />
      </div>
    );
  return <Formularios key={id ?? "nuevo"} lab={carga.datos ?? null} alRecargar={carga.recargar} fijarLab={(l) => carga.fijar(l)} />;
}

function Formularios({ lab, alRecargar, fijarLab }: { lab: LabDocente | null; alRecargar: () => void; fijarLab: (l: LabDocente) => void }) {
  const avisar = useAvisar();
  const navegar = useNavigate();
  const [f, setF] = useState<Formulario>(() => (lab ? desdeLab(lab) : formularioNuevo()));
  const [original, setOriginal] = useState(() => JSON.stringify(lab ? desdeLab(lab) : formularioNuevo()));
  const [seccion, setSeccion] = useState<Seccion>("general");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sucio = JSON.stringify(f) !== original;
  const editable = !lab || lab.puede_editar;

  // Tras guardar se navega antes de que React aplique el nuevo estado «limpio»: la bandera evita bloquear esa salida.
  const salidaPermitida = useRef(false);
  const bloqueo = useBlocker(
    ({ currentLocation, nextLocation }) => sucio && !salidaPermitida.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => {
      if (sucio) e.preventDefault();
    };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [sucio]);

  const cambiar = <K extends keyof Formulario>(clave: K, valor: Formulario[K]) => setF((x) => ({ ...x, [clave]: valor }));
  const cambiarConfig = (clave: string, valor: unknown) =>
    setF((x) => {
      const config = { ...x.config };
      // Un campo vacío vuelve al valor por defecto del motor.
      if (valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0)) delete config[clave];
      else config[clave] = valor;
      return { ...x, config };
    });

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (f.titulo.trim().length < 3) {
      setError("El título debe tener al menos 3 caracteres.");
      setSeccion("general");
      return;
    }
    setGuardando(true);
    setError(null);
    const cuerpo = {
      ...f,
      titulo: f.titulo.trim(),
      slug: f.slug.trim() || undefined,
      objetivos: f.objetivos.map((o) => ({ ...o, texto: o.texto.trim() })).filter((o) => o.texto),
      conceptos: f.conceptos.map((c) => c.trim()).filter(Boolean),
      pistas: f.pistas.map((p) => p.trim()).filter(Boolean),
      preguntas: f.preguntas.map(limpiarPregunta).filter((q) => q.pregunta && q.opciones.length >= 2),
    };
    try {
      const guardado = lab
        ? await api<LabDocente>(`/laboratorios/${lab.id}`, { metodo: "PUT", cuerpo })
        : await api<LabDocente>("/laboratorios", { metodo: "POST", cuerpo });
      const nuevoF = desdeLab(guardado);
      setF(nuevoF);
      setOriginal(JSON.stringify(nuevoF));
      fijarLab(guardado);
      avisar(lab ? "Laboratorio guardado." : "Laboratorio creado. Ahora agrega los casos de prueba.");
      if (!lab) {
        salidaPermitida.current = true;
        navegar(`/laboratorios/${guardado.id}/editar`, { replace: true });
      }
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  const duplicar = async () => {
    if (!lab) return;
    try {
      const copia = await api<LabDocente>(`/laboratorios/${lab.id}/duplicar`, { metodo: "POST" });
      avisar(`Se creó «${copia.titulo}».`);
      navegar(`/laboratorios/${copia.id}/editar`);
    } catch (err) {
      avisar(mensaje(err), "error");
    }
  };

  return (
    <div className="contenedor pagina editor-lab">
      <nav className="migas" aria-label="Ruta">
        <Link to="/laboratorios">Banco de laboratorios</Link>
        <span aria-hidden="true">/</span>
        <span>{lab ? lab.titulo : "Nuevo laboratorio"}</span>
      </nav>
      <form onSubmit={guardar}>
        <div className="encabezado encabezado-fijo">
          <div>
            <h1>{f.titulo.trim() || "Nuevo laboratorio"}</h1>
            <div className="fila" style={{ gap: 8 }}>
              <ChipModelo modelo={f.modelo} />
              <span className="meta">
                {lab ? `Versión ${lab.version}` : "Sin guardar"}
                {sucio && lab ? ", con cambios sin guardar" : ""}
              </span>
            </div>
          </div>
          <div className="acciones">
            {lab && (
              <Link className="boton" to={`/laboratorios/${lab.id}`}>
                <Icono nombre="ejecutar" /> Probar
              </Link>
            )}
            {editable && (
              <button className="boton boton-primario" type="submit" disabled={guardando || (!sucio && !!lab)}>
                {guardando ? "Guardando…" : lab ? "Guardar cambios" : "Crear laboratorio"}
              </button>
            )}
          </div>
        </div>
        {!editable && (
          <Aviso titulo="Solo lectura">
            Este laboratorio pertenece al banco institucional o a otro docente.{" "}
            <button type="button" className="boton-enlace" onClick={duplicar}>
              Duplícalo
            </button>{" "}
            para adaptarlo a tu curso sin afectar a los demás.
          </Aviso>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
        <Pestanas
          etiqueta="Partes del laboratorio"
          activa={seccion}
          alCambiar={setSeccion}
          pestanas={[
            { id: "general", texto: "Datos generales" },
            { id: "enunciado", texto: "Enunciado" },
            { id: "codigo", texto: "Código" },
            { id: "evaluacion", texto: "Evaluación" },
            { id: "casos", texto: "Casos de prueba", contador: lab?.casos.length ?? 0 },
            { id: "apoyo", texto: "Pistas y preguntas" },
          ]}
        />
        <div className="panel-pestana" role="tabpanel" id={`panel-${seccion}`} aria-labelledby={`pestana-${seccion}`}>
          {seccion === "codigo" ? (
            <SeccionCodigo f={f} cambiar={cambiar} soloLectura={!editable} />
          ) : (
            <fieldset className="sin-borde" disabled={!editable}>
              {seccion === "general" && <SeccionGeneral f={f} cambiar={cambiar} />}
              {seccion === "enunciado" && <SeccionEnunciado f={f} cambiar={cambiar} />}
              {seccion === "evaluacion" && <SeccionEvaluacion f={f} cambiarConfig={cambiarConfig} />}
              {seccion === "apoyo" && <SeccionApoyo f={f} cambiar={cambiar} />}
            </fieldset>
          )}
        </div>
      </form>
      {seccion === "casos" &&
        (lab ? (
          <SeccionCasos lab={lab} editable={editable} sucio={sucio} alCambiar={alRecargar} />
        ) : (
          <Aviso titulo="Primero crea el laboratorio">Los casos de prueba se agregan después de guardar los datos generales.</Aviso>
        ))}
      <Dialogo
        abierto={bloqueo.state === "blocked"}
        alCerrar={() => bloqueo.reset?.()}
        titulo="Hay cambios sin guardar"
        descripcion="Si sales ahora, se perderán los cambios del formulario. Los casos de prueba ya están guardados."
        pie={
          <>
            <button className="boton boton-sutil" onClick={() => bloqueo.reset?.()}>
              Seguir editando
            </button>
            <button className="boton boton-peligro" onClick={() => bloqueo.proceed?.()}>
              Salir sin guardar
            </button>
          </>
        }
      />
    </div>
  );
}

type Cambiar = <K extends keyof Formulario>(clave: K, valor: Formulario[K]) => void;

// ============================================================================= Datos generales
function SeccionGeneral({ f, cambiar }: { f: Formulario; cambiar: Cambiar }) {
  return (
    <div className="formulario ancho-lectura">
      <div className="campo">
        <label htmlFor="lab-titulo">Título</label>
        <input
          id="lab-titulo"
          value={f.titulo}
          onChange={(e) => cambiar("titulo", e.target.value)}
          required
          minLength={3}
          maxLength={200}
        />
      </div>
      <div className="campos-3">
        <div className="campo">
          <label htmlFor="lab-modelo">Modelo de programación</label>
          <select
            id="lab-modelo"
            value={f.modelo}
            onChange={(e) => {
              const m = e.target.value as Modelo;
              cambiar("modelo", m);
              cambiar("lenguaje", m === "cuda" ? "cuda" : f.lenguaje === "cuda" ? "c" : f.lenguaje);
              if (Object.values(PLANTILLAS).includes(f.plantilla)) cambiar("plantilla", PLANTILLAS[m]);
            }}
          >
            {(["openmp", "mpi", "cuda"] as Modelo[]).map((m) => (
              <option key={m} value={m}>
                {NOMBRE_MODELO[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="lab-lenguaje">Lenguaje</label>
          <select
            id="lab-lenguaje"
            value={f.lenguaje}
            onChange={(e) => cambiar("lenguaje", e.target.value as Lenguaje)}
            disabled={f.modelo === "cuda"}
          >
            {f.modelo === "cuda" ? (
              <option value="cuda">CUDA C++</option>
            ) : (
              <>
                <option value="c">C</option>
                <option value="cpp">C++</option>
              </>
            )}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="lab-nivel">Nivel</label>
          <select id="lab-nivel" value={f.nivel} onChange={(e) => cambiar("nivel", e.target.value as Nivel)}>
            <option value="basico">Básico</option>
            <option value="intermedio">Intermedio</option>
            <option value="avanzado">Avanzado</option>
          </select>
        </div>
      </div>
      <div className="campo">
        <label htmlFor="lab-resumen">Resumen</label>
        <textarea id="lab-resumen" rows={2} value={f.resumen} onChange={(e) => cambiar("resumen", e.target.value)} maxLength={2000} />
        <span className="ayuda">Una o dos frases: aparece en las listas de laboratorios.</span>
      </div>
      <div className="campo">
        <label htmlFor="lab-conceptos">Conceptos</label>
        <input
          id="lab-conceptos"
          value={f.conceptos.join(", ")}
          onChange={(e) =>
            cambiar(
              "conceptos",
              e.target.value.split(",").map((c) => c.trimStart()),
            )
          }
          onBlur={() => cambiar("conceptos", f.conceptos.map((c) => c.trim()).filter(Boolean))}
        />
        <span className="ayuda">Separados por comas, por ejemplo: reduction, condición de carrera, aceleración.</span>
      </div>
      <div className="campos-3">
        <div className="campo">
          <label htmlFor="lab-duracion">Duración estimada (min)</label>
          <input
            id="lab-duracion"
            type="number"
            min={5}
            max={600}
            value={f.duracion_estimada_min}
            onChange={(e) => cambiar("duracion_estimada_min", Number(e.target.value))}
          />
        </div>
        <div className="campo">
          <label htmlFor="lab-orden">Orden en el banco</label>
          <input id="lab-orden" type="number" value={f.orden} onChange={(e) => cambiar("orden", Number(e.target.value))} />
        </div>
        <div className="campo">
          <label htmlFor="lab-slug">Identificador (opcional)</label>
          <input
            id="lab-slug"
            value={f.slug}
            onChange={(e) => cambiar("slug", e.target.value.toLowerCase())}
            pattern="[a-z0-9][a-z0-9\-]{2,79}"
            placeholder="se genera del título"
          />
        </div>
      </div>
      <fieldset className="grupo">
        <legend className="etiqueta">Objetivos de aprendizaje</legend>
        <p className="ayuda">Redáctalos con un verbo observable; el nivel sigue la taxonomía de Bloom revisada.</p>
        {f.objetivos.map((o, i) => (
          <div key={i} className="fila-objetivo">
            <select
              aria-label={`Nivel del objetivo ${i + 1}`}
              value={o.nivel ?? "Aplicar"}
              onChange={(e) =>
                cambiar(
                  "objetivos",
                  f.objetivos.map((x, j) => (j === i ? { ...x, nivel: e.target.value } : x)),
                )
              }
            >
              {NIVELES_BLOOM.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <input
              aria-label={`Objetivo ${i + 1}`}
              value={o.texto}
              onChange={(e) =>
                cambiar(
                  "objetivos",
                  f.objetivos.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)),
                )
              }
            />
            <button
              type="button"
              className="boton boton-sutil boton-icono"
              aria-label={`Quitar el objetivo ${i + 1}`}
              onClick={() =>
                cambiar(
                  "objetivos",
                  f.objetivos.filter((_, j) => j !== i),
                )
              }
            >
              <Icono nombre="cerrar" tamano={16} />
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="boton boton-chico"
            onClick={() => cambiar("objetivos", [...f.objetivos, { nivel: "Aplicar", texto: "" }])}
          >
            <Icono nombre="mas" tamano={16} /> Agregar objetivo
          </button>
        </div>
      </fieldset>
      <label className="casilla">
        <input type="checkbox" checked={f.publicado} onChange={(e) => cambiar("publicado", e.target.checked)} />
        <span>
          <strong>Publicado.</strong> Los estudiantes solo ven los laboratorios publicados que su docente les asigna. Mientras lo preparas,
          déjalo como borrador.
        </span>
      </label>
    </div>
  );
}

// ============================================================================= Enunciado
function SeccionEnunciado({ f, cambiar }: { f: Formulario; cambiar: Cambiar }) {
  return (
    <div className="enunciado-editor">
      <div className="campo">
        <label htmlFor="lab-md">Enunciado en Markdown</label>
        <textarea
          id="lab-md"
          className="mono"
          value={f.enunciado_md}
          onChange={(e) => cambiar("enunciado_md", e.target.value)}
          spellCheck
        />
        <span className="ayuda">
          Admite tablas, listas y fórmulas LaTeX entre $…$ (en línea) o $$…$$ (en bloque). Describe la entrada y la salida con exactitud: la
          comparación es automática.
        </span>
      </div>
      <div className="vista-previa" aria-label="Vista previa del enunciado">
        <span className="etiqueta-io">Vista previa</span>
        <Markdown texto={f.enunciado_md} />
      </div>
    </div>
  );
}

// ============================================================================= Código
function SeccionCodigo({ f, cambiar, soloLectura }: { f: Formulario; cambiar: Cambiar; soloLectura: boolean }) {
  const [cual, setCual] = useState<"plantilla" | "solucion_referencia" | "solucion_docente">("plantilla");
  const ayudas: Record<typeof cual, string> = {
    plantilla: "Código inicial que recibe el estudiante. Incluye la medición de tiempo con la línea LABPAR_TIEMPO en la salida de errores.",
    solucion_referencia:
      "Versión secuencial en C. Genera las salidas esperadas de los casos y es la base para calcular la aceleración. Compila con gcc -O2 sin OpenMP.",
    solucion_docente:
      "Solución paralela de ejemplo. No la ven los estudiantes; sirve para verificar que el laboratorio es resoluble y alcanza el objetivo.",
  };
  return (
    <div className="pila" style={{ gap: 12 }}>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <div className="segmentado" role="group" aria-label="Archivo">
          {(
            [
              ["plantilla", "Plantilla"],
              ["solucion_referencia", "Referencia secuencial"],
              ["solucion_docente", "Solución del docente"],
            ] as const
          ).map(([id, texto]) => (
            <button key={id} type="button" aria-pressed={cual === id} onClick={() => setCual(id)}>
              {texto}
            </button>
          ))}
        </div>
      </div>
      <p className="meta">{ayudas[cual]}</p>
      <div className="editor-marco">
        <Editor key={cual} valor={f[cual]} alCambiar={(v) => cambiar(cual, v)} soloLectura={soloLectura} etiqueta={`Código: ${cual}`} />
      </div>
    </div>
  );
}

// ============================================================================= Configuración de la evaluación
function listaNumeros(texto: string): number[] {
  return texto
    .split(/[,\s]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 1 && x <= 256);
}

function CampoNumero({
  id,
  etiqueta,
  valor,
  defecto,
  alCambiar,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  valor: unknown;
  defecto: unknown;
  alCambiar: (v: number | undefined) => void;
  ayuda?: ReactNode;
}) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        type="number"
        step="any"
        value={valor === undefined || valor === null ? "" : String(valor)}
        placeholder={defecto === null || defecto === undefined ? "" : String(defecto)}
        onChange={(e) => alCambiar(e.target.value === "" ? undefined : Number(e.target.value))}
      />
      {ayuda && <span className="ayuda">{ayuda}</span>}
    </div>
  );
}

function EditorReglas({
  titulo,
  ayuda,
  reglas,
  alCambiar,
}: {
  titulo: string;
  ayuda: string;
  reglas: Regla[];
  alCambiar: (r: Regla[]) => void;
}) {
  const [prueba, setPrueba] = useState<Record<number, string | null>>({});
  return (
    <fieldset className="grupo">
      <legend className="etiqueta">{titulo}</legend>
      <p className="ayuda">{ayuda}</p>
      {reglas.map((r, i) => (
        <div key={i} className="fila-regla">
          <input
            className="mono"
            aria-label={`Expresión regular ${i + 1}`}
            placeholder="Expresión regular, p. ej. \bMPI_Reduce\s*\("
            value={r.patron}
            onChange={(e) => {
              let errorRegex: string | null = null;
              try {
                new RegExp(e.target.value);
              } catch (err) {
                errorRegex = (err as Error).message;
              }
              setPrueba({ ...prueba, [i]: errorRegex });
              alCambiar(reglas.map((x, j) => (j === i ? { ...x, patron: e.target.value } : x)));
            }}
            aria-invalid={!!prueba[i]}
          />
          <input
            aria-label={`Mensaje para el estudiante ${i + 1}`}
            placeholder="Mensaje que verá el estudiante"
            value={r.mensaje}
            onChange={(e) => alCambiar(reglas.map((x, j) => (j === i ? { ...x, mensaje: e.target.value } : x)))}
          />
          <button
            type="button"
            className="boton boton-sutil boton-icono"
            aria-label={`Quitar la regla ${i + 1}`}
            onClick={() => alCambiar(reglas.filter((_, j) => j !== i))}
          >
            <Icono nombre="cerrar" tamano={16} />
          </button>
          {prueba[i] && <span className="ayuda error-campo">Expresión no válida: {prueba[i]}</span>}
        </div>
      ))}
      <div>
        <button type="button" className="boton boton-chico" onClick={() => alCambiar([...reglas, { patron: "", mensaje: "" }])}>
          <Icono nombre="mas" tamano={16} /> Agregar regla
        </button>
      </div>
    </fieldset>
  );
}

function SeccionEvaluacion({ f, cambiarConfig }: { f: Formulario; cambiarConfig: (clave: string, valor: unknown) => void }) {
  const c = f.config;
  const d = CONFIG_POR_DEFECTO as Record<string, unknown>;
  const cuda = f.modelo === "cuda";
  const [jsonTexto, setJsonTexto] = useState<string | null>(null);
  const extras = useMemo(() => Object.fromEntries(Object.entries(c).filter(([k]) => !(k in d))), [c, d]);
  const nombreP = f.modelo === "mpi" ? "procesos" : "hilos";
  return (
    <div className="formulario ancho-lectura">
      <p className="meta">
        Los campos vacíos usan el valor por defecto del motor (en gris). El puntaje es {String(c.peso_correccion ?? d.peso_correccion)} %
        corrección y {String(c.peso_rendimiento ?? d.peso_rendimiento)} % rendimiento; el rendimiento solo se mide si todos los casos son
        correctos.
      </p>
      <h3 className="subtitulo-form">Corrección</h3>
      {!cuda && (
        <div className="campos-3">
          <div className="campo">
            <label htmlFor="cfg-hc">Valores de p para los casos</label>
            <input
              id="cfg-hc"
              placeholder={(d.hilos_correccion as number[]).join(", ")}
              defaultValue={Array.isArray(c.hilos_correccion) ? (c.hilos_correccion as number[]).join(", ") : ""}
              onBlur={(e) => cambiarConfig("hilos_correccion", e.target.value.trim() ? listaNumeros(e.target.value) : undefined)}
            />
            <span className="ayuda">Número de {nombreP}, separados por comas. Incluye 1 y al menos un valor mayor.</span>
          </div>
          <CampoNumero
            id="cfg-rc"
            etiqueta="Repeticiones por caso"
            valor={c.repeticiones_correccion}
            defecto={d.repeticiones_correccion}
            alCambiar={(v) => cambiarConfig("repeticiones_correccion", v)}
            ayuda="Más repeticiones detectan mejor el no determinismo."
          />
          <CampoNumero
            id="cfg-tl"
            etiqueta="Tiempo límite por ejecución (s)"
            valor={c.tiempo_limite_s}
            defecto={d.tiempo_limite_s}
            alCambiar={(v) => cambiarConfig("tiempo_limite_s", v)}
          />
        </div>
      )}
      <div className="campos-3">
        <div className="campo">
          <label htmlFor="cfg-comp">Comparación de la salida</label>
          <select
            id="cfg-comp"
            value={String(c.comparacion ?? "")}
            onChange={(e) => cambiarConfig("comparacion", e.target.value || undefined)}
          >
            <option value="">Por defecto (palabras y números)</option>
            <option value="exacta">Exacta</option>
            <option value="tokens">Palabras y números</option>
            <option value="numerica">Numérica con tolerancia</option>
          </select>
        </div>
        <CampoNumero
          id="cfg-tol"
          etiqueta="Tolerancia relativa"
          valor={c.tolerancia_rel}
          defecto={d.tolerancia_rel}
          alCambiar={(v) => cambiarConfig("tolerancia_rel", v)}
          ayuda="Solo para la comparación numérica."
        />
        <CampoNumero
          id="cfg-mem"
          etiqueta="Memoria máxima (MB)"
          valor={c.memoria_mb}
          defecto={d.memoria_mb}
          alCambiar={(v) => cambiarConfig("memoria_mb", v)}
        />
      </div>

      <h3 className="subtitulo-form">Rendimiento</h3>
      <div className="campo">
        <label htmlFor="cfg-er">Entrada de rendimiento</label>
        <textarea
          id="cfg-er"
          className="mono"
          rows={2}
          value={String(c.entrada_rendimiento ?? "")}
          onChange={(e) => cambiarConfig("entrada_rendimiento", e.target.value || undefined)}
          placeholder="Una entrada grande, que tarde entre 0,5 y 3 s en la versión secuencial"
        />
        <span className="ayuda">Si la dejas vacía, el laboratorio solo evalúa la corrección y el puntaje se basa en los casos.</span>
      </div>
      <div className="campos-3">
        {!cuda && (
          <div className="campo">
            <label htmlFor="cfg-hr">Valores de p para medir</label>
            <input
              id="cfg-hr"
              placeholder={(d.hilos_rendimiento as number[]).join(", ")}
              defaultValue={Array.isArray(c.hilos_rendimiento) ? (c.hilos_rendimiento as number[]).join(", ") : ""}
              onBlur={(e) => cambiarConfig("hilos_rendimiento", e.target.value.trim() ? listaNumeros(e.target.value) : undefined)}
            />
            <span className="ayuda">Se usan solo los que no superen los núcleos del nodo.</span>
          </div>
        )}
        {cuda ? (
          <CampoNumero
            id="cfg-ao"
            etiqueta="Aceleración objetivo frente a la CPU"
            valor={c.aceleracion_objetivo}
            defecto={5}
            alCambiar={(v) => cambiarConfig("aceleracion_objetivo", v)}
          />
        ) : (
          <CampoNumero
            id="cfg-eo"
            etiqueta="Eficiencia objetivo"
            valor={c.eficiencia_objetivo}
            defecto={d.eficiencia_objetivo}
            alCambiar={(v) => cambiarConfig("eficiencia_objetivo", v)}
            ayuda="Con el mayor p; 0,6 significa S ≥ 0,6·p."
          />
        )}
        <CampoNumero
          id="cfg-rr"
          etiqueta="Repeticiones de la medición"
          valor={c.repeticiones_rendimiento}
          defecto={d.repeticiones_rendimiento}
          alCambiar={(v) => cambiarConfig("repeticiones_rendimiento", v)}
          ayuda="Se toma el mínimo."
        />
      </div>
      <div className="campos-3">
        <CampoNumero
          id="cfg-pc"
          etiqueta="Peso de la corrección"
          valor={c.peso_correccion}
          defecto={d.peso_correccion}
          alCambiar={(v) => cambiarConfig("peso_correccion", v)}
        />
        <CampoNumero
          id="cfg-pr"
          etiqueta="Peso del rendimiento"
          valor={c.peso_rendimiento}
          defecto={d.peso_rendimiento}
          alCambiar={(v) => cambiarConfig("peso_rendimiento", v)}
        />
        <CampoNumero
          id="cfg-tlr"
          etiqueta="Tiempo límite de la medición (s)"
          valor={c.tiempo_limite_rendimiento_s}
          defecto={d.tiempo_limite_rendimiento_s}
          alCambiar={(v) => cambiarConfig("tiempo_limite_rendimiento_s", v)}
        />
      </div>

      <h3 className="subtitulo-form">Requisitos del código</h3>
      <EditorReglas
        titulo="Construcciones obligatorias"
        ayuda="Expresiones regulares que deben aparecer en el código (se ignoran comentarios y cadenas). Si alguna falta, el puntaje máximo es 50."
        reglas={(c.requisitos as Regla[] | undefined) ?? []}
        alCambiar={(r) => cambiarConfig("requisitos", r)}
      />
      <EditorReglas
        titulo="Construcciones prohibidas"
        ayuda="Por ejemplo, prohibir MPI_Reduce en un laboratorio sobre comunicación punto a punto."
        reglas={(c.prohibidos as Regla[] | undefined) ?? []}
        alCambiar={(r) => cambiarConfig("prohibidos", r)}
      />
      <div className="campo">
        <label htmlFor="cfg-pistas-r">Sugerencias de rendimiento propias del laboratorio</label>
        <textarea
          id="cfg-pistas-r"
          rows={3}
          value={((c.pistas_rendimiento as string[] | undefined) ?? []).join("\n")}
          onChange={(e) =>
            cambiarConfig(
              "pistas_rendimiento",
              e.target.value.split("\n").filter((x) => x.trim()),
            )
          }
          placeholder="Una por línea; se muestran cuando la aceleración no alcanza el objetivo"
        />
      </div>
      <details className="plegable">
        <summary>Configuración avanzada en JSON</summary>
        <div className="contenido pila" style={{ gap: 8 }}>
          <p className="ayuda">
            Claves adicionales del motor (por ejemplo, flags_compilacion o tiempo_total_correccion_s). Se combinan con los campos
            anteriores.
          </p>
          <textarea
            className="entrada mono"
            rows={6}
            value={jsonTexto ?? JSON.stringify(extras, null, 2)}
            onChange={(e) => setJsonTexto(e.target.value)}
            onBlur={() => {
              if (jsonTexto === null) return;
              try {
                const nuevo = JSON.parse(jsonTexto || "{}") as Record<string, unknown>;
                for (const k of Object.keys(extras)) if (!(k in nuevo)) cambiarConfig(k, undefined);
                for (const [k, v] of Object.entries(nuevo)) cambiarConfig(k, v);
                setJsonTexto(null);
              } catch {
                /* se mantiene el texto para que lo corrijan */
              }
            }}
          />
        </div>
      </details>
    </div>
  );
}

// ============================================================================= Pistas y preguntas
function SeccionApoyo({ f, cambiar }: { f: Formulario; cambiar: Cambiar }) {
  return (
    <div className="formulario ancho-lectura">
      <div className="campo">
        <label htmlFor="lab-pistas">Pistas</label>
        <textarea id="lab-pistas" rows={5} value={f.pistas.join("\n")} onChange={(e) => cambiar("pistas", e.target.value.split("\n"))} />
        <span className="ayuda">
          Una por línea, de la más general a la más concreta. El estudiante las descubre una a la vez y queda registro de cuántas vio.
        </span>
      </div>
      <fieldset className="grupo">
        <legend className="etiqueta">Preguntas de repaso</legend>
        <p className="ayuda">Preguntas de opción múltiple que no afectan el puntaje. Marca la opción correcta y explica por qué.</p>
        {f.preguntas.map((q, i) => (
          <div key={i} className="editor-pregunta">
            <div className="campo">
              <label htmlFor={`q-${i}`}>Pregunta {i + 1}</label>
              <textarea
                id={`q-${i}`}
                rows={2}
                value={q.pregunta}
                onChange={(e) =>
                  cambiar(
                    "preguntas",
                    f.preguntas.map((x, j) => (j === i ? { ...x, pregunta: e.target.value } : x)),
                  )
                }
              />
            </div>
            {q.opciones.map((o, k) => (
              <div key={k} className="fila-opcion">
                <input
                  type="radio"
                  name={`correcta-${i}`}
                  aria-label={`La opción ${k + 1} es la correcta`}
                  checked={q.correcta === k}
                  onChange={() =>
                    cambiar(
                      "preguntas",
                      f.preguntas.map((x, j) => (j === i ? { ...x, correcta: k } : x)),
                    )
                  }
                />
                <input
                  aria-label={`Opción ${k + 1}`}
                  value={o}
                  onChange={(e) =>
                    cambiar(
                      "preguntas",
                      f.preguntas.map((x, j) =>
                        j === i ? { ...x, opciones: x.opciones.map((y, m) => (m === k ? e.target.value : y)) } : x,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <div className="campo">
              <label htmlFor={`qe-${i}`}>Explicación</label>
              <textarea
                id={`qe-${i}`}
                rows={2}
                value={q.explicacion ?? ""}
                onChange={(e) =>
                  cambiar(
                    "preguntas",
                    f.preguntas.map((x, j) => (j === i ? { ...x, explicacion: e.target.value } : x)),
                  )
                }
              />
            </div>
            <div>
              <button
                type="button"
                className="boton boton-chico boton-peligro"
                onClick={() =>
                  cambiar(
                    "preguntas",
                    f.preguntas.filter((_, j) => j !== i),
                  )
                }
              >
                <Icono nombre="basura" tamano={15} /> Quitar la pregunta
              </button>
            </div>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="boton boton-chico"
            onClick={() =>
              cambiar("preguntas", [...f.preguntas, { pregunta: "", opciones: ["", "", "", ""], correcta: 0, explicacion: "" }])
            }
          >
            <Icono nombre="mas" tamano={16} /> Agregar pregunta
          </button>
        </div>
      </fieldset>
    </div>
  );
}

// ============================================================================= Casos de prueba
function SeccionCasos({ lab, editable, sucio, alCambiar }: { lab: LabDocente; editable: boolean; sucio: boolean; alCambiar: () => void }) {
  const avisar = useAvisar();
  const [editando, setEditando] = useState<Caso | "nuevo" | null>(null);
  const [borrando, setBorrando] = useState<Caso | null>(null);
  const [referencia, setReferencia] = useState<Envio | null>(null);
  const [verificacion, setVerificacion] = useState<Envio | null>(null);
  const refViva = useSeguimientoEnvio(referencia, (e) => {
    alCambiar();
    if (e.resultado?.veredicto === "completado") avisar("Salidas esperadas actualizadas con la solución de referencia.");
  });
  const verViva = useSeguimientoEnvio(verificacion);

  const generar = async () => {
    try {
      setReferencia(await api<Envio>(`/laboratorios/${lab.id}/generar-salidas`, { metodo: "POST" }));
    } catch (e) {
      avisar(mensaje(e), "error");
    }
  };
  const verificar = async () => {
    try {
      setVerificacion(
        await api<Envio>("/envios", {
          metodo: "POST",
          cuerpo: { laboratorio_id: lab.id, codigo: lab.solucion_docente, tipo: "evaluacion" },
        }),
      );
    } catch (e) {
      avisar(mensaje(e), "error");
    }
  };
  const borrar = async (c: Caso) => {
    try {
      await api(`/casos/${c.id}`, { metodo: "DELETE" });
      setBorrando(null);
      avisar(`Se eliminó el caso «${c.nombre}».`);
      alCambiar();
    } catch (e) {
      avisar(mensaje(e), "error");
    }
  };

  return (
    <div className="pila" style={{ gap: 20, marginTop: 20 }}>
      <p className="meta ancho-lectura">
        Los cambios en los casos se guardan de inmediato. Escribe las entradas y deja que la solución de referencia calcule las salidas
        esperadas; luego verifica que la solución del docente obtiene 100 puntos.
        {sucio && " Guarda antes los cambios del código para que la verificación use la versión actual."}
      </p>
      {editable && (
        <div className="fila">
          <button className="boton" onClick={() => setEditando("nuevo")}>
            <Icono nombre="mas" /> Agregar caso
          </button>
          <button className="boton" onClick={generar} disabled={!lab.casos.length || (!!refViva && !terminado(refViva))}>
            <Icono nombre="actualizar" /> Generar salidas con la referencia
          </button>
          <button className="boton" onClick={verificar} disabled={!lab.solucion_docente.trim() || (!!verViva && !terminado(verViva))}>
            <Icono nombre="check" /> Evaluar la solución del docente
          </button>
        </div>
      )}
      {refViva && (
        <div className="panel panel-compacto">
          {!terminado(refViva) ? (
            <ProgresoEnvio envio={refViva} />
          ) : (
            <div className="pila" style={{ gap: 8 }}>
              <Veredicto clave={refViva.resultado?.veredicto} />
              {refViva.resultado?.veredicto === "error_compilacion" && (
                <pre className="consola">{refViva.resultado.compilacion?.salida}</pre>
              )}
              {refViva.resultado?.casos && (
                <ul className="lista-simple">
                  {refViva.resultado.casos.map((c) => (
                    <li key={c.id}>
                      {c.ok ? "Correcto" : "Falló"}: {c.nombre} ({segundos(c.tiempo_s)})
                      {c.error && <pre className="consola">{c.error}</pre>}
                    </li>
                  ))}
                </ul>
              )}
              {refViva.resultado?.rendimiento && (
                <p className="meta">
                  Entrada de rendimiento: la referencia tarda{" "}
                  {segundos(refViva.resultado.rendimiento.tiempo_interno_s ?? refViva.resultado.rendimiento.tiempo_s)}. Lo recomendable es
                  entre 0,5 y 3 s para medir con precisión sin alargar la evaluación.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {lab.casos.length === 0 ? (
        <Aviso titulo="El laboratorio no tiene casos">
          Agrega al menos un caso visible (ejemplo para los estudiantes) y varios ocultos que cubran los bordes: n = 0, n = 1, n no
          divisible por p y un tamaño grande.
        </Aviso>
      ) : (
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th>Caso</th>
                <th>Entrada</th>
                <th>Salida esperada</th>
                <th className="num">Peso</th>
                {editable && (
                  <th>
                    <span className="oculto-visual">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lab.casos.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nombre}</strong>
                    <div>{c.visible ? <span className="chip chip-ok">Visible</span> : <span className="chip chip-borde">Oculto</span>}</div>
                  </td>
                  <td>
                    <code className="recorte">{c.entrada.slice(0, 80) || "(vacía)"}</code>
                  </td>
                  <td>
                    {c.salida_esperada.trim() ? (
                      <code className="recorte">{c.salida_esperada.slice(0, 80)}</code>
                    ) : (
                      <span className="chip chip-aviso">Sin salida</span>
                    )}
                  </td>
                  <td className="num">{numero(c.peso, c.peso % 1 ? 1 : 0)}</td>
                  {editable && (
                    <td className="num">
                      <button
                        className="boton boton-sutil boton-icono"
                        onClick={() => setEditando(c)}
                        aria-label={`Editar el caso ${c.nombre}`}
                      >
                        <Icono nombre="editar" tamano={17} />
                      </button>
                      <button
                        className="boton boton-sutil boton-icono"
                        onClick={() => setBorrando(c)}
                        aria-label={`Eliminar el caso ${c.nombre}`}
                      >
                        <Icono nombre="basura" tamano={17} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="meta">
        {plural(lab.casos.filter((c) => c.visible).length, "caso visible", "casos visibles")} y{" "}
        {plural(lab.casos.filter((c) => !c.visible).length, "oculto", "ocultos")}.
      </p>
      {verViva && (
        <section className="panel">
          <h3 style={{ marginBottom: 12 }}>Verificación con la solución del docente</h3>
          {terminado(verViva) ? <ResultadoEvaluacion envio={verViva} /> : <ProgresoEnvio envio={verViva} />}
        </section>
      )}
      {editando && (
        <DialogoCaso
          lab={lab}
          caso={editando === "nuevo" ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            alCambiar();
          }}
        />
      )}
      <Dialogo
        abierto={borrando !== null}
        alCerrar={() => setBorrando(null)}
        titulo="¿Eliminar el caso de prueba?"
        descripcion={borrando ? `«${borrando.nombre}» dejará de usarse en las evaluaciones nuevas.` : undefined}
        pie={
          <>
            <button className="boton boton-sutil" onClick={() => setBorrando(null)}>
              Cancelar
            </button>
            <button className="boton boton-peligro" onClick={() => borrando && borrar(borrando)}>
              Eliminar
            </button>
          </>
        }
      />
    </div>
  );
}

function DialogoCaso({
  lab,
  caso,
  alCerrar,
  alGuardar,
}: {
  lab: LabDocente;
  caso: Caso | null;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(caso?.nombre ?? `Caso ${lab.casos.length + 1}`);
  const [entrada, setEntrada] = useState(caso?.entrada ?? "");
  const [salida, setSalida] = useState(caso?.salida_esperada ?? "");
  const [visible, setVisible] = useState(caso?.visible ?? false);
  const [peso, setPeso] = useState(caso?.peso ?? 1);
  const [error, setError] = useState<string | null>(null);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const cuerpo = { nombre, entrada, salida_esperada: salida, visible, peso, orden: caso?.orden };
    try {
      if (caso) await api(`/casos/${caso.id}`, { metodo: "PUT", cuerpo });
      else await api(`/laboratorios/${lab.id}/casos`, { metodo: "POST", cuerpo });
      alGuardar();
    } catch (err) {
      setError(mensaje(err));
    }
  };
  return (
    <Dialogo abierto alCerrar={alCerrar} ancho titulo={caso ? "Editar el caso de prueba" : "Nuevo caso de prueba"}>
      <form className="formulario" onSubmit={guardar}>
        <div className="campos-2">
          <div className="campo">
            <label htmlFor="caso-nombre">Nombre</label>
            <input id="caso-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} />
          </div>
          <div className="campo">
            <label htmlFor="caso-peso">Peso</label>
            <input
              id="caso-peso"
              type="number"
              min={0.1}
              max={100}
              step="any"
              value={peso}
              onChange={(e) => setPeso(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="campos-2">
          <div className="campo">
            <label htmlFor="caso-entrada">Entrada</label>
            <textarea
              id="caso-entrada"
              className="mono"
              rows={7}
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="campo">
            <label htmlFor="caso-salida">Salida esperada</label>
            <textarea
              id="caso-salida"
              className="mono"
              rows={7}
              value={salida}
              onChange={(e) => setSalida(e.target.value)}
              spellCheck={false}
              placeholder="Déjala vacía y usa «Generar salidas con la referencia»"
            />
          </div>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          <span>Visible para los estudiantes como ejemplo. Los casos ocultos solo se usan al evaluar y su contenido nunca se muestra.</span>
        </label>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="acciones">
          <button className="boton boton-primario" type="submit">
            {caso ? "Guardar el caso" : "Agregar el caso"}
          </button>
          <button className="boton boton-sutil" type="button" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
