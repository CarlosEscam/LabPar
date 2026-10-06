import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Icono } from "../componentes/Icono";
import { useAvisar } from "../componentes/Notificaciones";
import { Aviso, BarraProgreso, Cargando, ChipModelo, ChipNivel, Dialogo, ErrorCarga, Pestanas, Vacio, Veredicto } from "../componentes/UI";
import { api, descargar, mensaje } from "../lib/api";
import { aEntradaFecha, deEntradaFecha, fecha, haceCuanto, NOMBRE_MODELO, numero, plural, puntaje } from "../lib/formato";
import { useCarga, useTitulo } from "../lib/ganchos";
import { useUsuario } from "../lib/sesion";
import type {
  Analitica,
  Asignacion,
  CeldaProgreso,
  Curso,
  EnvioResumen,
  EstudianteCurso,
  LabResumen,
  Modelo,
  Progreso,
} from "../lib/tipos";
import { FechaLimite } from "./Inicio";
import { PanelAnalitica, PanelEncuesta } from "./AnaliticaCurso";

type Seccion = "laboratorios" | "estudiantes" | "progreso" | "analitica" | "encuesta" | "datos";
const SECCIONES: Seccion[] = ["laboratorios", "estudiantes", "progreso", "analitica", "encuesta", "datos"];

export default function CursoDocente() {
  const { cursoId } = useParams();
  const id = Number(cursoId);
  const usuario = useUsuario();
  const [parametros, setParametros] = useSearchParams();
  const seccion = (SECCIONES.includes(parametros.get("seccion") as Seccion) ? parametros.get("seccion") : "laboratorios") as Seccion;
  const curso = useCarga((senal) => api<Curso>(`/cursos/${id}`, { senal }), [id]);
  const [editar, setEditar] = useState(false);
  useTitulo(curso.datos?.nombre);

  if (curso.cargando && !curso.datos)
    return (
      <div className="contenedor pagina">
        <Cargando />
      </div>
    );
  if (curso.error || !curso.datos)
    return (
      <div className="contenedor pagina">
        <ErrorCarga mensaje={curso.error ?? "No se pudo cargar el curso."} reintentar={curso.recargar} />
      </div>
    );
  const c = curso.datos;
  const gestiona = usuario.rol === "admin" || c.docente_id === usuario.id;

  return (
    <div className="contenedor pagina">
      <nav className="migas" aria-label="Ruta">
        <Link to="/">Cursos</Link>
        <span aria-hidden="true">/</span>
        <span>{c.nombre}</span>
      </nav>
      <div className="encabezado" style={{ marginTop: 12, marginBottom: 20 }}>
        <div>
          <h1>{c.nombre}</h1>
          <p className="descripcion">
            {c.periodo ? `Periodo ${c.periodo}. ` : ""}
            {plural(c.num_estudiantes, "estudiante")} y {plural(c.num_asignaciones, "laboratorio asignado", "laboratorios asignados")}.
            {!c.activo && " Curso archivado: los estudiantes no lo ven."}
          </p>
        </div>
        {gestiona && (
          <div className="acciones">
            <button className="boton" onClick={() => setEditar(true)}>
              <Icono nombre="editar" /> Editar el curso
            </button>
          </div>
        )}
      </div>
      {!gestiona && <Aviso titulo="Solo lectura">Este curso lo dirige {c.docente_nombre}. Puedes consultarlo, pero no modificarlo.</Aviso>}
      <Pestanas
        etiqueta="Secciones del curso"
        activa={seccion}
        alCambiar={(s) => setParametros(s === "laboratorios" ? {} : { seccion: s }, { replace: true })}
        pestanas={[
          { id: "laboratorios", texto: "Laboratorios", contador: c.num_asignaciones },
          { id: "estudiantes", texto: "Estudiantes", contador: c.num_estudiantes },
          { id: "progreso", texto: "Progreso" },
          { id: "analitica", texto: "Analítica" },
          { id: "encuesta", texto: "Encuesta SUS" },
          { id: "datos", texto: "Datos para investigación" },
        ]}
      />
      <div className="panel-pestana" role="tabpanel" id={`panel-${seccion}`} aria-labelledby={`pestana-${seccion}`}>
        {gestiona ? (
          <>
            {seccion === "laboratorios" && <PestanaLaboratorios curso={c} alCambiar={curso.recargar} />}
            {seccion === "estudiantes" && <PestanaEstudiantes curso={c} alCambiar={curso.recargar} fijarCurso={(x) => curso.fijar(x)} />}
            {seccion === "progreso" && <PestanaProgreso curso={c} />}
            {seccion === "analitica" && <PanelAnalitica cursoId={c.id} />}
            {seccion === "encuesta" && <PanelEncuesta curso={c} fijarCurso={(x) => curso.fijar(x)} />}
            {seccion === "datos" && <PestanaDatos curso={c} />}
          </>
        ) : (
          seccion === "laboratorios" && <PestanaLaboratorios curso={c} alCambiar={curso.recargar} soloLectura />
        )}
      </div>
      {gestiona && <DialogoEditarCurso abierto={editar} curso={c} alCerrar={() => setEditar(false)} alGuardar={(x) => curso.fijar(x)} />}
    </div>
  );
}

// ============================================================================= Edición del curso
function DialogoEditarCurso({
  abierto,
  curso,
  alCerrar,
  alGuardar,
}: {
  abierto: boolean;
  curso: Curso;
  alCerrar: () => void;
  alGuardar: (c: Curso) => void;
}) {
  const avisar = useAvisar();
  const [nombre, setNombre] = useState(curso.nombre);
  const [periodo, setPeriodo] = useState(curso.periodo);
  const [descripcion, setDescripcion] = useState(curso.descripcion);
  const [activo, setActivo] = useState(curso.activo);
  const [error, setError] = useState<string | null>(null);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const c = await api<Curso>(`/cursos/${curso.id}`, { metodo: "PATCH", cuerpo: { nombre, periodo, descripcion, activo } });
      alGuardar(c);
      avisar("Curso actualizado.");
      alCerrar();
    } catch (err) {
      setError(mensaje(err));
    }
  };
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo="Editar el curso">
      <form className="formulario" onSubmit={guardar}>
        <div className="campos-2">
          <div className="campo">
            <label htmlFor="ec-nombre">Nombre</label>
            <input id="ec-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} minLength={3} required />
          </div>
          <div className="campo">
            <label htmlFor="ec-periodo">Periodo</label>
            <input id="ec-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="ec-desc">Descripción</label>
          <textarea id="ec-desc" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <label className="casilla">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <span>Curso activo. Si lo desactivas, los estudiantes dejan de verlo y no pueden enviar código.</span>
        </label>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="acciones">
          <button className="boton boton-primario" type="submit">
            Guardar cambios
          </button>
          <button className="boton boton-sutil" type="button" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

// ============================================================================= Laboratorios asignados
function PestanaLaboratorios({ curso, alCambiar, soloLectura = false }: { curso: Curso; alCambiar: () => void; soloLectura?: boolean }) {
  const avisar = useAvisar();
  const asignaciones = useCarga((senal) => api<Asignacion[]>(`/cursos/${curso.id}/asignaciones`, { senal }), [curso.id]);
  const [asignar, setAsignar] = useState(false);
  const [editando, setEditando] = useState<Asignacion | null>(null);
  const [quitando, setQuitando] = useState<Asignacion | null>(null);

  const recargar = () => {
    asignaciones.recargar();
    alCambiar();
  };
  const quitar = async (a: Asignacion) => {
    try {
      await api(`/asignaciones/${a.id}`, { metodo: "DELETE" });
      avisar(`Se quitó «${a.laboratorio.titulo}» del curso.`);
      setQuitando(null);
      recargar();
    } catch (e) {
      avisar(mensaje(e), "error");
    }
  };

  if (asignaciones.cargando && !asignaciones.datos) return <Cargando />;
  if (asignaciones.error) return <ErrorCarga mensaje={asignaciones.error} reintentar={asignaciones.recargar} />;
  const lista = asignaciones.datos ?? [];

  return (
    <div className="pila" style={{ gap: 20 }}>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <p className="meta">
          Los estudiantes ven los laboratorios en este orden. Las fechas límite son informativas: un envío tardío se acepta y se marca.
        </p>
        {!soloLectura && (
          <button className="boton boton-primario" onClick={() => setAsignar(true)}>
            <Icono nombre="mas" /> Asignar laboratorios
          </button>
        )}
      </div>
      {lista.length === 0 ? (
        <Vacio
          titulo="Este curso aún no tiene laboratorios"
          accion={
            !soloLectura && (
              <button className="boton boton-primario" onClick={() => setAsignar(true)}>
                Elegir del banco
              </button>
            )
          }
        >
          Elige laboratorios del banco de OpenMP, MPI y CUDA. Puedes fijar una fecha límite y un número máximo de intentos para cada uno.
        </Vacio>
      ) : (
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th>Laboratorio</th>
                <th>Fecha límite</th>
                <th className="num">Intentos</th>
                <th>Aceptados</th>
                {!soloLectura && (
                  <th>
                    <span className="oculto-visual">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="fila" style={{ gap: 10 }}>
                      <ChipModelo modelo={a.laboratorio.modelo} />
                      <Link className="titulo-fila" to={`/laboratorios/${a.laboratorio.id}`}>
                        {a.laboratorio.titulo}
                      </Link>
                      {!a.laboratorio.publicado && <span className="chip chip-aviso">Borrador</span>}
                    </div>
                  </td>
                  <td className="meta">
                    <FechaLimite iso={a.fecha_limite} />
                  </td>
                  <td className="num">{a.intentos_max ?? "Sin límite"}</td>
                  <td style={{ minWidth: 180 }}>
                    <div className="progreso-celda">
                      <BarraProgreso
                        valor={a.estudiantes_aceptados ?? 0}
                        total={curso.num_estudiantes}
                        etiqueta={`Aceptados en ${a.laboratorio.titulo}`}
                      />
                      <span className="meta cifra">
                        {a.estudiantes_aceptados ?? 0} de {curso.num_estudiantes}
                      </span>
                    </div>
                  </td>
                  {!soloLectura && (
                    <td className="num">
                      <button
                        className="boton boton-sutil boton-icono"
                        onClick={() => setEditando(a)}
                        aria-label={`Editar la asignación de ${a.laboratorio.titulo}`}
                        title="Fecha límite e intentos"
                      >
                        <Icono nombre="editar" tamano={17} />
                      </button>
                      <button
                        className="boton boton-sutil boton-icono"
                        onClick={() => setQuitando(a)}
                        aria-label={`Quitar ${a.laboratorio.titulo} del curso`}
                        title="Quitar del curso"
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
      {!soloLectura && (
        <>
          <DialogoAsignar
            abierto={asignar}
            curso={curso}
            asignados={new Set(lista.map((a) => a.laboratorio.id))}
            alCerrar={() => setAsignar(false)}
            alAsignar={(n) => {
              setAsignar(false);
              avisar(`Se ${n === 1 ? "asignó 1 laboratorio" : `asignaron ${n} laboratorios`}.`);
              recargar();
            }}
          />
          {editando && (
            <DialogoAsignacion
              asignacion={editando}
              alCerrar={() => setEditando(null)}
              alGuardar={() => {
                setEditando(null);
                avisar("Asignación actualizada.");
                recargar();
              }}
            />
          )}
          <Dialogo
            abierto={quitando !== null}
            alCerrar={() => setQuitando(null)}
            titulo="¿Quitar el laboratorio del curso?"
            descripcion={
              quitando
                ? `«${quitando.laboratorio.titulo}» dejará de aparecer a los estudiantes. Sus envíos anteriores se conservan para la analítica.`
                : undefined
            }
            pie={
              <>
                <button className="boton boton-sutil" onClick={() => setQuitando(null)}>
                  Cancelar
                </button>
                <button className="boton boton-peligro" onClick={() => quitando && quitar(quitando)}>
                  Quitar del curso
                </button>
              </>
            }
          />
        </>
      )}
    </div>
  );
}

function DialogoAsignar({
  abierto,
  curso,
  asignados,
  alCerrar,
  alAsignar,
}: {
  abierto: boolean;
  curso: Curso;
  asignados: Set<number>;
  alCerrar: () => void;
  alAsignar: (n: number) => void;
}) {
  const labs = useCarga(
    (senal) => (abierto ? api<LabResumen[]>("/laboratorios", { senal }) : Promise.resolve([] as LabResumen[])),
    [abierto],
  );
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [fechaLimite, setFechaLimite] = useState("");
  const [intentos, setIntentos] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disponibles = (labs.datos ?? []).filter((l) => !asignados.has(l.id));

  const alternar = (id: number) => {
    const s = new Set(elegidos);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setElegidos(s);
  };
  const asignar = async () => {
    setEnviando(true);
    setError(null);
    let n = 0;
    try {
      for (const id of elegidos) {
        await api(`/cursos/${curso.id}/asignaciones`, {
          metodo: "POST",
          cuerpo: { laboratorio_id: id, fecha_limite: deEntradaFecha(fechaLimite), intentos_max: intentos ? Number(intentos) : null },
        });
        n++;
      }
      setElegidos(new Set());
      alAsignar(n);
    } catch (e) {
      setError(mensaje(e));
      if (n) alAsignar(n);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      ancho
      titulo="Asignar laboratorios"
      descripcion="Elige uno o varios laboratorios del banco. La fecha límite y el límite de intentos se aplican a todos los elegidos y se pueden cambiar después."
      pie={
        <>
          <button className="boton boton-sutil" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="boton boton-primario" disabled={elegidos.size === 0 || enviando} onClick={asignar}>
            {enviando ? "Asignando…" : elegidos.size ? `Asignar ${plural(elegidos.size, "laboratorio")}` : "Asignar"}
          </button>
        </>
      }
    >
      {labs.cargando && <Cargando />}
      {labs.error && <ErrorCarga mensaje={labs.error} reintentar={labs.recargar} />}
      {labs.datos && disponibles.length === 0 && <p className="meta">Todos los laboratorios del banco ya están asignados en este curso.</p>}
      {(["openmp", "mpi", "cuda"] as Modelo[]).map((m) => {
        const grupo = disponibles.filter((l) => l.modelo === m);
        if (!grupo.length) return null;
        return (
          <fieldset key={m} className="grupo-asignar">
            <legend className="etiqueta">{NOMBRE_MODELO[m]}</legend>
            {grupo.map((l) => (
              <label key={l.id} className="casilla casilla-lab">
                <input type="checkbox" checked={elegidos.has(l.id)} onChange={() => alternar(l.id)} />
                <span>
                  <strong>{l.titulo}</strong> <ChipNivel nivel={l.nivel} />
                  {!l.publicado && <span className="chip chip-aviso">Borrador</span>}
                  <span className="meta bloque">{l.resumen}</span>
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}
      {disponibles.length > 0 && (
        <div className="campos-2">
          <div className="campo">
            <label htmlFor="as-fecha">Fecha límite (opcional)</label>
            <input id="as-fecha" type="datetime-local" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="as-intentos">Intentos máximos (opcional)</label>
            <input
              id="as-intentos"
              type="number"
              min={1}
              max={1000}
              value={intentos}
              onChange={(e) => setIntentos(e.target.value)}
              placeholder="Sin límite"
            />
          </div>
        </div>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}
    </Dialogo>
  );
}

function DialogoAsignacion({ asignacion, alCerrar, alGuardar }: { asignacion: Asignacion; alCerrar: () => void; alGuardar: () => void }) {
  const [fechaLimite, setFechaLimite] = useState(aEntradaFecha(asignacion.fecha_limite));
  const [intentos, setIntentos] = useState(asignacion.intentos_max ? String(asignacion.intentos_max) : "");
  const [error, setError] = useState<string | null>(null);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/asignaciones/${asignacion.id}`, {
        metodo: "PATCH",
        cuerpo: { fecha_limite: deEntradaFecha(fechaLimite), intentos_max: intentos ? Number(intentos) : null },
      });
      alGuardar();
    } catch (err) {
      setError(mensaje(err));
    }
  };
  return (
    <Dialogo
      abierto
      alCerrar={alCerrar}
      titulo={asignacion.laboratorio.titulo}
      descripcion="Fecha límite y número máximo de envíos a evaluación por estudiante."
    >
      <form className="formulario" onSubmit={guardar}>
        <div className="campos-2">
          <div className="campo">
            <label htmlFor="ea-fecha">Fecha límite</label>
            <input id="ea-fecha" type="datetime-local" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="ea-intentos">Intentos máximos</label>
            <input
              id="ea-intentos"
              type="number"
              min={1}
              max={1000}
              value={intentos}
              onChange={(e) => setIntentos(e.target.value)}
              placeholder="Sin límite"
            />
          </div>
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="acciones">
          <button className="boton boton-primario" type="submit">
            Guardar
          </button>
          <button className="boton boton-sutil" type="button" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

// ============================================================================= Estudiantes
function PestanaEstudiantes({ curso, alCambiar, fijarCurso }: { curso: Curso; alCambiar: () => void; fijarCurso: (c: Curso) => void }) {
  const avisar = useAvisar();
  const navegar = useNavigate();
  const estudiantes = useCarga((senal) => api<EstudianteCurso[]>(`/cursos/${curso.id}/estudiantes`, { senal }), [curso.id]);
  const [retirando, setRetirando] = useState<EstudianteCurso | null>(null);
  const [regenerar, setRegenerar] = useState(false);
  const [filtro, setFiltro] = useState("");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(curso.codigo_inscripcion ?? "");
      avisar("Código copiado.");
    } catch {
      avisar("No se pudo copiar; selecciona el código manualmente.", "info");
    }
  };
  const retirar = async (e: EstudianteCurso) => {
    try {
      await api(`/cursos/${curso.id}/estudiantes/${e.id}`, { metodo: "DELETE" });
      avisar(`${e.nombre} ya no está inscrito en el curso.`);
      setRetirando(null);
      estudiantes.recargar();
      alCambiar();
    } catch (err) {
      avisar(mensaje(err), "error");
    }
  };
  const nuevoCodigo = async () => {
    try {
      const c = await api<Curso>(`/cursos/${curso.id}/regenerar-codigo`, { metodo: "POST" });
      fijarCurso(c);
      setRegenerar(false);
      avisar(`Nuevo código: ${c.codigo_inscripcion}. El anterior ya no sirve.`);
    } catch (err) {
      avisar(mensaje(err), "error");
    }
  };
  const lista = (estudiantes.datos ?? []).filter(
    (e) => !filtro || e.nombre.toLowerCase().includes(filtro.toLowerCase()) || e.email.toLowerCase().includes(filtro.toLowerCase()),
  );

  return (
    <div className="pila" style={{ gap: 24 }}>
      <section className="codigo-inscripcion" aria-labelledby="titulo-codigo">
        <div>
          <h2 id="titulo-codigo" className="titulo-panel">
            Código de inscripción
          </h2>
          <p className="meta">Compártelo con tus estudiantes: lo escriben al crear su cuenta o desde su página de inicio.</p>
        </div>
        <div className="fila">
          <span className="codigo-grande" aria-label={`Código ${curso.codigo_inscripcion?.split("").join(" ")}`}>
            {curso.codigo_inscripcion}
          </span>
          <button className="boton boton-chico" onClick={copiar}>
            <Icono nombre="copiar" tamano={16} /> Copiar
          </button>
          <button className="boton boton-chico boton-sutil" onClick={() => setRegenerar(true)}>
            <Icono nombre="actualizar" tamano={16} /> Generar otro
          </button>
        </div>
      </section>

      {estudiantes.cargando && !estudiantes.datos && <Cargando />}
      {estudiantes.error && <ErrorCarga mensaje={estudiantes.error} reintentar={estudiantes.recargar} />}
      {estudiantes.datos && estudiantes.datos.length === 0 && (
        <Vacio titulo="Todavía no hay estudiantes inscritos">
          Cuando un estudiante use el código del curso, aparecerá aquí con su actividad.
        </Vacio>
      )}
      {estudiantes.datos && estudiantes.datos.length > 0 && (
        <>
          <div className="campo" style={{ maxWidth: 360 }}>
            <label htmlFor="filtro-est" className="oculto-visual">
              Buscar estudiante
            </label>
            <input
              id="filtro-est"
              type="search"
              placeholder="Buscar por nombre o correo"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th className="num">Envíos</th>
                  <th className="num">Envíos aceptados</th>
                  <th>Último envío</th>
                  <th>Inscrito</th>
                  <th>
                    <span className="oculto-visual">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <button
                        className="boton-enlace"
                        style={{ fontWeight: 650 }}
                        onClick={() => navegar(`?seccion=progreso&estudiante=${e.id}`)}
                      >
                        {e.nombre}
                      </button>
                      <div className="meta">{e.email}</div>
                    </td>
                    <td className="num">{e.envios}</td>
                    <td className="num">{e.aceptados}</td>
                    <td className="meta">{e.ultimo_envio ? haceCuanto(e.ultimo_envio) : "Sin envíos"}</td>
                    <td className="meta">{fecha(e.inscrito_en, false)}</td>
                    <td className="num">
                      <button
                        className="boton boton-sutil boton-icono"
                        onClick={() => setRetirando(e)}
                        aria-label={`Retirar a ${e.nombre} del curso`}
                        title="Retirar del curso"
                      >
                        <Icono nombre="basura" tamano={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Dialogo
        abierto={retirando !== null}
        alCerrar={() => setRetirando(null)}
        titulo="¿Retirar al estudiante del curso?"
        descripcion={
          retirando
            ? `${retirando.nombre} dejará de ver los laboratorios del curso. Sus envíos se conservan y puede volver a inscribirse con el código.`
            : undefined
        }
        pie={
          <>
            <button className="boton boton-sutil" onClick={() => setRetirando(null)}>
              Cancelar
            </button>
            <button className="boton boton-peligro" onClick={() => retirando && retirar(retirando)}>
              Retirar
            </button>
          </>
        }
      />
      <Dialogo
        abierto={regenerar}
        alCerrar={() => setRegenerar(false)}
        titulo="¿Generar un código nuevo?"
        descripcion="El código actual dejará de funcionar. Los estudiantes ya inscritos no se ven afectados."
        pie={
          <>
            <button className="boton boton-sutil" onClick={() => setRegenerar(false)}>
              Cancelar
            </button>
            <button className="boton boton-primario" onClick={nuevoCodigo}>
              Generar código nuevo
            </button>
          </>
        }
      />
    </div>
  );
}

// ============================================================================= Progreso (estudiantes × laboratorios)
function PestanaProgreso({ curso }: { curso: Curso }) {
  const progreso = useCarga((senal) => api<Progreso>(`/cursos/${curso.id}/progreso`, { senal }), [curso.id]);
  const [parametros] = useSearchParams();
  const resaltado = Number(parametros.get("estudiante")) || null;
  const [celda, setCelda] = useState<{ estudiante: string; usuarioId: number; lab: LabResumen; datos: CeldaProgreso } | null>(null);

  const etiquetas = useMemo(() => {
    const contador: Record<string, number> = {};
    return (progreso.datos?.laboratorios ?? []).map((l) => {
      contador[l.modelo] = (contador[l.modelo] ?? 0) + 1;
      return `${NOMBRE_MODELO[l.modelo]} ${contador[l.modelo]}`;
    });
  }, [progreso.datos]);

  if (progreso.cargando && !progreso.datos) return <Cargando />;
  if (progreso.error || !progreso.datos) return <ErrorCarga mensaje={progreso.error ?? "Error"} reintentar={progreso.recargar} />;
  const { estudiantes, laboratorios, celdas } = progreso.datos;
  if (!estudiantes.length || !laboratorios.length)
    return (
      <Vacio titulo="Aún no hay progreso que mostrar">
        La matriz aparece cuando el curso tiene estudiantes inscritos y laboratorios asignados.
      </Vacio>
    );
  const indice = new Map(celdas.map((c) => [`${c.usuario_id}-${c.laboratorio_id}`, c]));

  return (
    <div className="pila" style={{ gap: 16 }}>
      <p className="meta">
        Cada celda muestra el mejor puntaje del estudiante en el laboratorio. Pulsa una celda para ver sus envíos y el código.
      </p>
      <div className="tabla-marco matriz-progreso-marco">
        <table className="matriz-progreso">
          <thead>
            <tr>
              <th scope="col" className="mp-estudiante">
                Estudiante
              </th>
              {laboratorios.map((l, i) => (
                <th key={l.id} scope="col" title={l.titulo} className={`mp-lab mp-${l.modelo}`}>
                  {etiquetas[i]}
                </th>
              ))}
              <th scope="col" className="num">
                Aceptados
              </th>
            </tr>
          </thead>
          <tbody>
            {estudiantes.map((e) => {
              const aceptados = laboratorios.filter((l) => indice.get(`${e.id}-${l.id}`)?.aceptado).length;
              return (
                <tr key={e.id} className={resaltado === e.id ? "mp-resaltado" : undefined}>
                  <th scope="row" className="mp-estudiante">
                    {e.nombre}
                  </th>
                  {laboratorios.map((l) => {
                    const c = indice.get(`${e.id}-${l.id}`);
                    const estado = !c || !c.intentos ? "vacia" : c.aceptado ? "aceptada" : "progreso";
                    return (
                      <td key={l.id} className="mp-celda">
                        <button
                          className={`mp-boton mp-${estado}`}
                          disabled={!c || !c.intentos}
                          onClick={() => c && setCelda({ estudiante: e.nombre, usuarioId: e.id, lab: l, datos: c })}
                          aria-label={`${e.nombre}, ${l.titulo}: ${!c || !c.intentos ? "sin intentos" : `${c.aceptado ? "aceptado" : "en progreso"}, mejor puntaje ${puntaje(c.mejor_puntaje)}, ${plural(c.intentos, "intento")}`}`}
                        >
                          {c && c.intentos ? puntaje(c.mejor_puntaje) : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="num cifra">
                    {aceptados} / {laboratorios.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="leyenda">
        <li>
          <span className="leyenda-barra" style={{ background: "var(--ok)" }} /> Aceptado
        </li>
        <li>
          <span className="leyenda-barra" style={{ background: "var(--aviso)" }} /> Con intentos, sin aceptar
        </li>
        <li>
          <span className="leyenda-barra" style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--linea-fuerte)" }} /> Sin
          intentos
        </li>
      </ul>
      <details className="plegable">
        <summary>Laboratorios de la matriz</summary>
        <ol className="contenido lista-labs-matriz">
          {laboratorios.map((l, i) => (
            <li key={l.id}>
              <strong>{etiquetas[i]}:</strong> {l.titulo}
            </li>
          ))}
        </ol>
      </details>
      {celda && <DialogoEnviosEstudiante curso={curso} {...celda} alCerrar={() => setCelda(null)} />}
    </div>
  );
}

function DialogoEnviosEstudiante({
  curso,
  estudiante,
  usuarioId,
  lab,
  datos,
  alCerrar,
}: {
  curso: Curso;
  estudiante: string;
  usuarioId: number;
  lab: LabResumen;
  datos: CeldaProgreso;
  alCerrar: () => void;
}) {
  const envios = useCarga(
    (senal) => api<EnvioResumen[]>(`/envios?curso_id=${curso.id}&usuario_id=${usuarioId}&laboratorio_id=${lab.id}&limite=100`, { senal }),
    [curso.id, usuarioId, lab.id],
  );
  return (
    <Dialogo abierto alCerrar={alCerrar} ancho titulo={`${estudiante}: ${lab.titulo}`}>
      <dl className="cifras">
        <div>
          <dt>Mejor puntaje</dt>
          <dd className="cifra">{puntaje(datos.mejor_puntaje)}</dd>
        </div>
        <div>
          <dt>Envíos a evaluación</dt>
          <dd className="cifra">{datos.intentos}</dd>
        </div>
        <div>
          <dt>Hasta el primer aceptado</dt>
          <dd className="cifra">
            {datos.minutos_hasta_aceptado !== null ? `${numero(datos.minutos_hasta_aceptado, 0)} min` : "—"}
            {datos.envios_hasta_aceptado !== null && <span className="meta"> ({plural(datos.envios_hasta_aceptado, "envío")})</span>}
          </dd>
        </div>
        <div>
          <dt>Mejor aceleración</dt>
          <dd className="cifra">{datos.mejor_aceleracion !== null ? numero(datos.mejor_aceleracion) : "—"}</dd>
        </div>
      </dl>
      {envios.cargando && <Cargando />}
      {envios.datos && (
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th>Envío</th>
                <th>Resultado</th>
                <th className="num">Puntaje</th>
                <th className="num">S</th>
                <th>
                  <span className="oculto-visual">Ver</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {envios.datos.map((e) => (
                <tr key={e.id}>
                  <td>
                    #{e.id} <span className="meta">{fecha(e.creado_en)}</span>
                    {Boolean(e.parametros?.tardio) && <span className="chip chip-aviso">tardío</span>}
                  </td>
                  <td>
                    <Veredicto clave={e.estado === "completado" ? e.veredicto : e.estado} />
                  </td>
                  <td className="num">{puntaje(e.puntaje)}</td>
                  <td className="num">{e.aceleracion !== null ? numero(e.aceleracion) : "—"}</td>
                  <td className="num">
                    <Link to={`/envios/${e.id}`} className="boton boton-chico">
                      Ver código y resultado
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialogo>
  );
}

// ============================================================================= Datos para investigación
function PestanaDatos({ curso }: { curso: Curso }) {
  const avisar = useAvisar();
  const analitica = useCarga((senal) => api<Analitica>(`/cursos/${curso.id}/analitica`, { senal }), [curso.id]);
  const [descargando, setDescargando] = useState<string | null>(null);
  const bajar = async (tipo: string) => {
    setDescargando(tipo);
    try {
      await descargar(`/cursos/${curso.id}/exportar/${tipo}`, `curso${curso.id}_${tipo}`);
    } catch (e) {
      avisar(mensaje(e), "error");
    } finally {
      setDescargando(null);
    }
  };
  const resumen = analitica.datos?.resumen;
  const archivos = [
    {
      tipo: "envios.csv",
      titulo: "Envíos",
      texto: "Cada ejecución y evaluación: laboratorio, veredicto, puntaje, aceleración, eficiencia, número de intento y si fue tardía.",
    },
    {
      tipo: "progreso.csv",
      titulo: "Progreso",
      texto:
        "Una fila por estudiante y laboratorio: intentos, mejor puntaje, envíos y minutos hasta el primer aceptado (variable de la hipótesis H3).",
    },
    {
      tipo: "eventos.csv",
      titulo: "Eventos de uso",
      texto: "Aperturas de laboratorios, pistas vistas, preguntas respondidas y uso del simulador, con marca de tiempo.",
    },
    { tipo: "sus.csv", titulo: "Encuesta SUS", texto: "Las diez respuestas de cada estudiante y su puntaje SUS (hipótesis H2)." },
  ];
  return (
    <div className="pila" style={{ gap: 20 }}>
      <Aviso titulo="Datos seudonimizados y con consentimiento">
        Los archivos incluyen solo a los estudiantes que autorizaron el uso de sus datos para investigación
        {resumen ? ` (${resumen.consentimientos} de ${resumen.estudiantes})` : ""}. Cada uno aparece con un código estable, como
        E-3F9A2C71D0, que no permite identificarlo sin la clave del servidor. Por la misma razón, la plataforma no muestra quién dio la
        autorización.
      </Aviso>
      <ul className="exportaciones">
        {archivos.map((a) => (
          <li key={a.tipo}>
            <div>
              <h3>{a.titulo}</h3>
              <p className="meta">{a.texto}</p>
            </div>
            <button className="boton" onClick={() => bajar(a.tipo)} disabled={descargando !== null}>
              <Icono nombre="descargar" />
              {descargando === a.tipo ? "Descargando…" : `Descargar ${a.tipo}`}
            </button>
          </li>
        ))}
      </ul>
      <p className="meta">Los archivos usan UTF-8 con BOM, separador coma y fechas en UTC (ISO 8601), listos para pandas, R o Excel.</p>
    </div>
  );
}
