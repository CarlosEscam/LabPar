import { lazy } from "react";
import { Link, useParams } from "react-router";
import { BarraProgreso, Cargando, ErrorCarga, Vacio } from "../componentes/UI";
import { api } from "../lib/api";
import { NOMBRE_MODELO } from "../lib/formato";
import { useCarga, useTitulo } from "../lib/ganchos";
import { esPersonal, useUsuario } from "../lib/sesion";
import type { Asignacion, Curso as TipoCurso, Modelo } from "../lib/tipos";
import { BannerEncuesta, FilaAsignacion } from "./Inicio";

const CursoDocente = lazy(() => import("./CursoDocente"));

export default function Curso() {
  const usuario = useUsuario();
  return esPersonal(usuario) ? <CursoDocente /> : <CursoEstudiante />;
}

function CursoEstudiante() {
  const { cursoId } = useParams();
  const id = Number(cursoId);
  const datos = useCarga(
    async (senal) => {
      const [curso, asignaciones] = await Promise.all([
        api<TipoCurso>(`/cursos/${id}`, { senal }),
        api<Asignacion[]>(`/cursos/${id}/asignaciones`, { senal }),
      ]);
      return { curso, asignaciones };
    },
    [id],
  );
  useTitulo(datos.datos?.curso.nombre);
  if (datos.cargando && !datos.datos)
    return (
      <div className="contenedor pagina">
        <Cargando />
      </div>
    );
  if (datos.error || !datos.datos)
    return (
      <div className="contenedor pagina">
        <ErrorCarga mensaje={datos.error ?? "No se pudo cargar el curso."} reintentar={datos.recargar} />
      </div>
    );
  const { curso, asignaciones } = datos.datos;
  const aceptados = asignaciones.filter((a) => a.estado === "aceptado").length;
  const modelos = (["openmp", "mpi", "cuda"] as Modelo[]).filter((m) => asignaciones.some((a) => a.laboratorio.modelo === m));

  return (
    <div className="contenedor pagina">
      <nav className="migas" aria-label="Ruta">
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span>{curso.nombre}</span>
      </nav>
      <div className="encabezado" style={{ marginTop: 12 }}>
        <div>
          <h1>{curso.nombre}</h1>
          <p className="descripcion">
            {curso.periodo && `Periodo ${curso.periodo}. `}Docente: {curso.docente_nombre}.
          </p>
          {curso.descripcion && <p className="descripcion">{curso.descripcion}</p>}
        </div>
      </div>
      <div className="progreso-curso">
        <BarraProgreso valor={aceptados} total={asignaciones.length} etiqueta="Laboratorios aceptados" />
        <span className="meta cifra">
          {aceptados} de {asignaciones.length} aceptados
        </span>
      </div>
      {curso.encuesta_sus_activa && <BannerEncuesta curso={curso} />}
      {asignaciones.length === 0 && (
        <Vacio titulo="Todavía no hay laboratorios asignados">
          Tu docente aún no ha asignado laboratorios en este curso. Vuelve más tarde.
        </Vacio>
      )}
      {modelos.map((m) => (
        <section key={m} className="seccion">
          <h2>{NOMBRE_MODELO[m]}</h2>
          <ul className="lista-labs">
            {asignaciones
              .filter((a) => a.laboratorio.modelo === m)
              .map((a) => (
                <FilaAsignacion key={a.id} cursoId={curso.id} asignacion={a} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
