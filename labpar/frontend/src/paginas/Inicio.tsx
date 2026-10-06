import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Icono } from "../componentes/Icono";
import { useAvisar } from "../componentes/Notificaciones";
import { Aviso, BarraProgreso, Cargando, ChipModelo, Dialogo, ErrorCarga, Vacio, Veredicto } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { fecha, haceCuanto, NOMBRE_MODELO, plural, puntaje } from "../lib/formato";
import { useCarga, useTitulo } from "../lib/ganchos";
import { esPersonal, useUsuario } from "../lib/sesion";
import type { Asignacion, Curso, EnvioResumen, EstadoSistema, LabResumen, Modelo } from "../lib/tipos";

export default function Inicio() {
  const usuario = useUsuario();
  return esPersonal(usuario) ? <InicioDocente /> : <InicioEstudiante />;
}

// ============================================================================= Estudiante
interface CursoConAsignaciones {
  curso: Curso;
  asignaciones: Asignacion[];
}

export function DialogoInscripcion({
  abierto,
  alCerrar,
  alInscribir,
}: {
  abierto: boolean;
  alCerrar: () => void;
  alInscribir: (c: Curso) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const curso = await api<Curso>("/cursos/inscribirse", { metodo: "POST", cuerpo: { codigo: codigo.trim() } });
      setCodigo("");
      alInscribir(curso);
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Inscribirte en un curso"
      descripcion="Escribe el código de seis caracteres que te entregó tu docente."
    >
      <form className="formulario" onSubmit={enviar} id="form-inscripcion">
        <div className="campo">
          <label htmlFor="codigo-curso">Código del curso</label>
          <input
            id="codigo-curso"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            maxLength={16}
            autoComplete="off"
            style={{ letterSpacing: "0.12em", fontWeight: 650 }}
            autoFocus
          />
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="acciones">
          <button className="boton boton-primario" type="submit" disabled={enviando || codigo.trim().length < 4}>
            {enviando ? "Inscribiendo…" : "Inscribirme"}
          </button>
          <button className="boton boton-sutil" type="button" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

function siguienteLaboratorio(cursos: CursoConAsignaciones[], recientes: EnvioResumen[]) {
  // Prioridad: el laboratorio del último envío si aún no está aceptado; si no, el primero sin aceptar en orden.
  for (const envio of recientes) {
    for (const c of cursos) {
      const a = c.asignaciones.find((x) => x.laboratorio.id === envio.laboratorio_id);
      if (a && a.estado !== "aceptado") return { curso: c.curso, asignacion: a, envio };
    }
  }
  for (const c of cursos) {
    const a = c.asignaciones.find((x) => x.estado !== "aceptado");
    if (a) return { curso: c.curso, asignacion: a, envio: undefined };
  }
  return null;
}

export function EstadoAsignacion({ estado }: { estado: Asignacion["estado"] }) {
  if (estado === "aceptado")
    return (
      <span className="estado-asignacion estado-aceptado">
        <Icono nombre="check" tamano={15} grosor={2.6} /> Aceptado
      </span>
    );
  if (estado === "en_progreso")
    return (
      <span className="estado-asignacion estado-progreso">
        <span className="punto" aria-hidden="true" /> En progreso
      </span>
    );
  return (
    <span className="estado-asignacion estado-pendiente">
      <span className="punto" aria-hidden="true" /> Sin empezar
    </span>
  );
}

export function FechaLimite({ iso }: { iso: string | null }) {
  if (!iso) return <span className="tenue">Sin fecha límite</span>;
  const restante = new Date(iso).getTime() - Date.now();
  const vencida = restante < 0;
  const pronto = !vencida && restante < 3 * 86400_000;
  return (
    <span className={vencida ? "fecha-vencida" : pronto ? "fecha-pronto" : undefined} title={fecha(iso)}>
      {vencida ? `Venció ${haceCuanto(iso)}` : `Vence ${haceCuanto(iso)}`}
    </span>
  );
}

function InicioEstudiante() {
  useTitulo("Inicio");
  const usuario = useUsuario();
  const navegar = useNavigate();
  const avisar = useAvisar();
  const [inscribir, setInscribir] = useState(false);
  const datos = useCarga(async (senal) => {
    const cursos = await api<Curso[]>("/cursos", { senal });
    const conAsignaciones = await Promise.all(
      cursos.map(async (curso) => ({ curso, asignaciones: await api<Asignacion[]>(`/cursos/${curso.id}/asignaciones`, { senal }) })),
    );
    const recientes = await api<EnvioResumen[]>("/envios?limite=8", { senal });
    return { cursos: conAsignaciones, recientes };
  }, []);

  if (datos.cargando && !datos.datos)
    return (
      <div className="contenedor pagina">
        <Cargando />
      </div>
    );
  if (datos.error)
    return (
      <div className="contenedor pagina">
        <ErrorCarga mensaje={datos.error} reintentar={datos.recargar} />
      </div>
    );
  const { cursos, recientes } = datos.datos!;
  const total = cursos.reduce((n, c) => n + c.asignaciones.length, 0);
  const aceptados = cursos.reduce((n, c) => n + c.asignaciones.filter((a) => a.estado === "aceptado").length, 0);
  const siguiente = siguienteLaboratorio(cursos, recientes);
  const titulos = new Map<number, LabResumen>();
  cursos.forEach((c) => c.asignaciones.forEach((a) => titulos.set(a.laboratorio.id, a.laboratorio)));

  return (
    <div className="contenedor pagina">
      <div className="encabezado">
        <div>
          <h1>Hola, {usuario.nombre.split(" ")[0]}</h1>
          <p className="descripcion">
            {cursos.length === 0
              ? "Todavía no estás inscrito en ningún curso."
              : `Llevas ${plural(aceptados, "laboratorio aceptado", "laboratorios aceptados")} de ${total} en ${plural(cursos.length, "curso")}.`}
          </p>
        </div>
        <div className="acciones">
          <button className="boton" onClick={() => setInscribir(true)}>
            <Icono nombre="mas" /> Inscribirme en un curso
          </button>
        </div>
      </div>

      {cursos.length === 0 && (
        <Vacio
          titulo="Empieza con el código de tu curso"
          accion={
            <button className="boton boton-primario" onClick={() => setInscribir(true)}>
              Escribir el código
            </button>
          }
        >
          Tu docente te entrega un código de seis caracteres. Al inscribirte verás los laboratorios que te asignó.
        </Vacio>
      )}

      {siguiente && (
        <section className="continuar" aria-labelledby="titulo-continuar">
          <div className="continuar-texto">
            <h2 id="titulo-continuar" className="meta">
              {siguiente.envio ? "Continúa donde quedaste" : "Tu siguiente laboratorio"}
            </h2>
            <div className="fila">
              <ChipModelo modelo={siguiente.asignacion.laboratorio.modelo} />
              <span className="continuar-titulo">{siguiente.asignacion.laboratorio.titulo}</span>
            </div>
            <p className="meta">
              {siguiente.envio ? (
                <>
                  Último envío {haceCuanto(siguiente.envio.creado_en)}:{" "}
                  <Veredicto clave={siguiente.envio.veredicto ?? siguiente.envio.estado} />
                </>
              ) : (
                siguiente.asignacion.laboratorio.resumen
              )}
            </p>
          </div>
          <Link className="boton boton-primario" to={`/cursos/${siguiente.curso.id}/laboratorios/${siguiente.asignacion.laboratorio.id}`}>
            {siguiente.envio ? "Continuar" : "Empezar"}
          </Link>
        </section>
      )}

      {cursos.map(({ curso, asignaciones }) => {
        const ok = asignaciones.filter((a) => a.estado === "aceptado").length;
        const pendientes = asignaciones.filter((a) => a.estado !== "aceptado").slice(0, 4);
        return (
          <section key={curso.id} className="seccion">
            <header>
              <div className="pila" style={{ gap: 4 }}>
                <h2>
                  <Link to={`/cursos/${curso.id}`} className="enlace-titulo">
                    {curso.nombre}
                  </Link>
                </h2>
                <span className="meta">
                  {curso.periodo && `Periodo ${curso.periodo}. `}Docente: {curso.docente_nombre}
                </span>
              </div>
              <Link className="boton boton-chico" to={`/cursos/${curso.id}`}>
                Ver los {asignaciones.length} laboratorios
              </Link>
            </header>
            <div className="progreso-curso">
              <BarraProgreso valor={ok} total={asignaciones.length} etiqueta={`Laboratorios aceptados en ${curso.nombre}`} />
              <span className="meta cifra">
                {ok} de {asignaciones.length} aceptados
              </span>
            </div>
            {curso.encuesta_sus_activa && <BannerEncuesta curso={curso} />}
            {pendientes.length > 0 ? (
              <ul className="lista-labs">
                {pendientes.map((a) => (
                  <FilaAsignacion key={a.id} cursoId={curso.id} asignacion={a} />
                ))}
              </ul>
            ) : (
              asignaciones.length > 0 && <Aviso tono="ok">Aceptaste todos los laboratorios de este curso.</Aviso>
            )}
          </section>
        );
      })}

      {recientes.length > 0 && (
        <section className="seccion">
          <h2>Actividad reciente</h2>
          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Envío</th>
                  <th>Laboratorio</th>
                  <th>Resultado</th>
                  <th className="num">Puntaje</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((e) => (
                  <tr key={e.id} className="clic" onClick={() => navegar(`/envios/${e.id}`)}>
                    <td>
                      <Link to={`/envios/${e.id}`} className="titulo-fila" onClick={(ev) => ev.stopPropagation()}>
                        #{e.id}
                      </Link>{" "}
                      <span className="meta">{haceCuanto(e.creado_en)}</span>
                    </td>
                    <td>{titulos.get(e.laboratorio_id)?.titulo ?? `Laboratorio ${e.laboratorio_id}`}</td>
                    <td>
                      <Veredicto clave={e.estado === "completado" ? e.veredicto : e.estado} />
                    </td>
                    <td className="num">{puntaje(e.puntaje)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DialogoInscripcion
        abierto={inscribir}
        alCerrar={() => setInscribir(false)}
        alInscribir={(c) => {
          setInscribir(false);
          avisar(`Te inscribiste en ${c.nombre}.`);
          datos.recargar();
        }}
      />
    </div>
  );
}

export function BannerEncuesta({ curso }: { curso: Curso }) {
  const estado = useCarga((senal) => api<{ activa: boolean; respondida: boolean }>(`/sus/${curso.id}`, { senal }), [curso.id]);
  if (!estado.datos || !estado.datos.activa || estado.datos.respondida) return null;
  return (
    <div className="banner-encuesta">
      <Icono nombre="encuesta" />
      <div>
        <strong>Tu opinión sobre la plataforma</strong>
        <p className="meta">Diez afirmaciones, dos minutos. Las respuestas se analizan de forma agregada y no afectan tu nota.</p>
      </div>
      <Link className="boton boton-chico" to={`/cursos/${curso.id}/encuesta`}>
        Responder la encuesta
      </Link>
    </div>
  );
}

export function FilaAsignacion({ cursoId, asignacion: a }: { cursoId: number; asignacion: Asignacion }) {
  const lab = a.laboratorio;
  return (
    <li className={`fila-lab fila-lab-${lab.modelo}`}>
      <Link to={`/cursos/${cursoId}/laboratorios/${lab.id}`} className="fila-lab-enlace">
        <span className="fila-lab-titulo">{lab.titulo}</span>
        <span className="fila-lab-resumen">{lab.resumen}</span>
      </Link>
      <span className="fila-lab-modelo">
        <ChipModelo modelo={lab.modelo} />
      </span>
      <span className="fila-lab-estado">
        <EstadoAsignacion estado={a.estado} />
      </span>
      <span className="fila-lab-fecha meta">
        <FechaLimite iso={a.fecha_limite} />
      </span>
      <span className="fila-lab-puntaje meta cifra">
        {a.intentos ? (
          <>
            {plural(a.intentos, "intento")}
            {a.intentos_max ? ` de ${a.intentos_max}` : ""}, mejor {puntaje(a.mejor_puntaje)}
          </>
        ) : a.intentos_max ? (
          `${a.intentos_max} intentos disponibles`
        ) : (
          `${lab.duracion_estimada_min} min aprox.`
        )}
      </span>
    </li>
  );
}

// ============================================================================= Docente y administrador
function DialogoCurso({ abierto, alCerrar, alCrear }: { abierto: boolean; alCerrar: () => void; alCrear: (c: Curso) => void }) {
  const [nombre, setNombre] = useState("");
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() < 6 ? 1 : 2}`;
  });
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const curso = await api<Curso>("/cursos", {
        metodo: "POST",
        cuerpo: { nombre: nombre.trim(), periodo: periodo.trim(), descripcion },
      });
      setNombre("");
      setDescripcion("");
      alCrear(curso);
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Crear un curso"
      descripcion="Se genera un código de inscripción para tus estudiantes."
    >
      <form className="formulario" onSubmit={enviar}>
        <div className="campos-2">
          <div className="campo">
            <label htmlFor="curso-nombre">Nombre del curso</label>
            <input id="curso-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={3} autoFocus />
          </div>
          <div className="campo">
            <label htmlFor="curso-periodo">Periodo académico</label>
            <input id="curso-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} maxLength={40} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="curso-descripcion">Descripción (opcional)</label>
          <textarea id="curso-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="acciones">
          <button className="boton boton-primario" type="submit" disabled={enviando || nombre.trim().length < 3}>
            {enviando ? "Creando…" : "Crear curso"}
          </button>
          <button className="boton boton-sutil" type="button" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export function RecursosComputo({ estado }: { estado: EstadoSistema }) {
  const activos = estado.trabajadores.filter((t) => t.estado === "libre" || t.estado === "ocupado");
  return (
    <div className="recursos">
      <ul className="recursos-modelos">
        {(["openmp", "mpi", "cuda"] as Modelo[]).map((m) => (
          <li key={m} className={estado.capacidades[m] ? "disponible" : "no-disponible"}>
            <span className={`marca-modelo marca-${m}`} aria-hidden="true" />
            <span className="recursos-nombre">{NOMBRE_MODELO[m]}</span>
            <span className="meta">{estado.capacidades[m] ? "Disponible" : "Sin trabajador habilitado"}</span>
          </li>
        ))}
      </ul>
      <p className="meta">
        {activos.length === 0
          ? "No hay trabajadores del motor en línea: los envíos quedarán en cola."
          : `${plural(activos.length, "trabajador")} en ${plural(estado.nodos, "nodo")} con ${plural(estado.nucleos_totales, "núcleo")} en total. ${
              estado.cola.pendientes ? `${plural(estado.cola.pendientes, "envío")} en cola.` : "Sin envíos en cola."
            }`}
      </p>
    </div>
  );
}

function InicioDocente() {
  useTitulo("Inicio");
  const usuario = useUsuario();
  const avisar = useAvisar();
  const navegar = useNavigate();
  const [crear, setCrear] = useState(false);
  const cursos = useCarga((senal) => api<Curso[]>("/cursos", { senal }), []);
  const estado = useCarga((senal) => api<EstadoSistema>("/admin/estado", { senal }), []);
  const labs = useCarga((senal) => api<LabResumen[]>("/laboratorios", { senal }), []);

  const copiar = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      avisar(`Código ${codigo} copiado.`);
    } catch {
      avisar("No se pudo copiar automáticamente; selecciona el código y cópialo.", "info");
    }
  };

  return (
    <div className="contenedor pagina">
      <div className="encabezado">
        <div>
          <h1>{usuario.rol === "admin" ? "Cursos de la plataforma" : "Tus cursos"}</h1>
          <p className="descripcion">Asigna laboratorios, sigue el progreso de cada estudiante y exporta los datos de la investigación.</p>
        </div>
        <div className="acciones">
          <button className="boton boton-primario" onClick={() => setCrear(true)}>
            <Icono nombre="mas" /> Crear curso
          </button>
        </div>
      </div>

      <div className="inicio-docente">
        <div>
          {cursos.cargando && !cursos.datos && <Cargando />}
          {cursos.error && <ErrorCarga mensaje={cursos.error} reintentar={cursos.recargar} />}
          {cursos.datos && cursos.datos.length === 0 && (
            <Vacio
              titulo="Aún no tienes cursos"
              accion={
                <button className="boton boton-primario" onClick={() => setCrear(true)}>
                  Crear el primer curso
                </button>
              }
            >
              Crea un curso, comparte el código de inscripción con tus estudiantes y asígnales laboratorios del banco.
            </Vacio>
          )}
          {cursos.datos && cursos.datos.length > 0 && (
            <div className="tabla-marco">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th className="num">Estudiantes</th>
                    <th className="num">Laboratorios</th>
                    <th>Código</th>
                  </tr>
                </thead>
                <tbody>
                  {cursos.datos.map((c) => (
                    <tr key={c.id} className="clic" onClick={() => navegar(`/cursos/${c.id}`)}>
                      <td>
                        <Link to={`/cursos/${c.id}`} className="titulo-fila" onClick={(e) => e.stopPropagation()}>
                          {c.nombre}
                        </Link>
                        <div className="meta">
                          {c.periodo || "Sin periodo"}
                          {usuario.rol === "admin" && c.docente_id !== usuario.id ? `, ${c.docente_nombre}` : ""}
                          {!c.activo && ", archivado"}
                        </div>
                      </td>
                      <td className="num">{c.num_estudiantes}</td>
                      <td className="num">{c.num_asignaciones}</td>
                      <td>
                        {c.codigo_inscripcion && (
                          <button
                            className="codigo-curso"
                            onClick={(e) => {
                              e.stopPropagation();
                              copiar(c.codigo_inscripcion!);
                            }}
                            title="Copiar el código"
                          >
                            {c.codigo_inscripcion}
                            <Icono nombre="copiar" tamano={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <aside className="pila" aria-label="Resumen de la plataforma">
          <section className="panel panel-compacto">
            <h2 className="titulo-panel">Recursos de cómputo</h2>
            {estado.datos ? (
              <RecursosComputo estado={estado.datos} />
            ) : estado.error ? (
              <p className="meta">{estado.error}</p>
            ) : (
              <Cargando />
            )}
            <Link to="/sistema" className="meta">
              Ver el estado del sistema
            </Link>
          </section>
          <section className="panel panel-compacto">
            <h2 className="titulo-panel">Banco de laboratorios</h2>
            {labs.datos && (
              <ul className="conteo-modelos">
                {(["openmp", "mpi", "cuda"] as Modelo[]).map((m) => (
                  <li key={m}>
                    <ChipModelo modelo={m} />
                    <span className="cifra">{plural(labs.datos!.filter((l) => l.modelo === m).length, "laboratorio")}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/laboratorios" className="meta">
              Explorar y crear laboratorios
            </Link>
          </section>
        </aside>
      </div>

      <DialogoCurso
        abierto={crear}
        alCerrar={() => setCrear(false)}
        alCrear={(c) => {
          setCrear(false);
          avisar(`Curso creado. Código de inscripción: ${c.codigo_inscripcion}.`);
          navegar(`/cursos/${c.id}`);
        }}
      />
    </div>
  );
}
