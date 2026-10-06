import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Editor, type DiagnosticoEditor } from "../componentes/Editor";
import { Icono } from "../componentes/Icono";
import { useAvisar } from "../componentes/Notificaciones";
import { ProgresoEnvio, ResultadoEjecucion, ResultadoEvaluacion } from "../componentes/Resultados";
import { Cargando, ErrorCarga, Veredicto } from "../componentes/UI";
import { api, guardarBlob } from "../lib/api";
import { fecha } from "../lib/formato";
import { terminado, useCarga, useSeguimientoEnvio, useTitulo } from "../lib/ganchos";
import { esPersonal, useUsuario } from "../lib/sesion";
import type { Envio } from "../lib/tipos";

const TIPOS = { evaluacion: "Evaluación", ejecucion: "Ejecución en consola", referencia: "Generación de salidas" } as const;

export default function DetalleEnvio() {
  const { envioId } = useParams();
  const id = Number(envioId);
  const usuario = useUsuario();
  const avisar = useAvisar();
  const datos = useCarga(
    async (senal) => {
      const [envio, codigo] = await Promise.all([
        api<Envio>(`/envios/${id}`, { senal }),
        api<{ codigo: string }>(`/envios/${id}/codigo`, { senal }),
      ]);
      return { envio, codigo: codigo.codigo };
    },
    [id],
  );
  useTitulo(`Envío #${id}`);
  const envio = useSeguimientoEnvio(datos.datos?.envio ?? null);
  const [irA, setIrA] = useState<{ linea: number } | null>(null);
  const diagnosticos = useMemo<DiagnosticoEditor[]>(
    () =>
      (envio?.resultado?.compilacion?.diagnosticos ?? [])
        .filter((d) => d.linea)
        .map((d) => ({
          linea: d.linea!,
          mensaje: d.explicacion ? `${d.mensaje}\n${d.explicacion}` : d.mensaje,
          severidad: d.tipo === "error" ? "error" : "warning",
        })),
    [envio],
  );

  if (datos.cargando && !datos.datos)
    return (
      <div className="contenedor pagina">
        <Cargando />
      </div>
    );
  if (datos.error || !datos.datos || !envio)
    return (
      <div className="contenedor pagina">
        <ErrorCarga mensaje={datos.error ?? "No se pudo cargar el envío."} reintentar={datos.recargar} />
      </div>
    );
  const propio = envio.usuario_id === usuario.id;
  const enlaceLab =
    envio.curso_id && !esPersonal(usuario)
      ? `/cursos/${envio.curso_id}/laboratorios/${envio.laboratorio_id}`
      : esPersonal(usuario)
        ? `/laboratorios/${envio.laboratorio_id}`
        : null;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(datos.datos!.codigo);
      avisar("Código copiado.");
    } catch {
      avisar("No se pudo copiar el código.", "error");
    }
  };

  return (
    <div className="contenedor-ancho pagina">
      <nav className="migas" aria-label="Ruta">
        <Link to="/">Inicio</Link>
        {esPersonal(usuario) && envio.curso_id && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/cursos/${envio.curso_id}?seccion=progreso`}>Progreso del curso</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span>Envío #{envio.id}</span>
      </nav>
      <div className="encabezado" style={{ marginTop: 12 }}>
        <div>
          <h1>
            Envío #{envio.id}
            {envio.laboratorio_titulo ? `: ${envio.laboratorio_titulo}` : ""}
          </h1>
          <div className="resultado-meta meta">
            <span>{TIPOS[envio.tipo]}</span>
            <span>{fecha(envio.creado_en)}</span>
            {!propio && envio.usuario_nombre && <span>Estudiante: {envio.usuario_nombre}</span>}
            {terminado(envio) && <Veredicto clave={envio.estado === "completado" ? envio.veredicto : envio.estado} />}
          </div>
        </div>
        <div className="acciones">
          <button className="boton" onClick={copiar}>
            <Icono nombre="copiar" /> Copiar código
          </button>
          <button
            className="boton"
            onClick={() =>
              guardarBlob(
                new Blob([datos.datos!.codigo], { type: "text/x-c" }),
                `envio_${envio.id}.${envio.resultado?.modelo === "cuda" ? "cu" : "c"}`,
              )
            }
          >
            <Icono nombre="descargar" /> Descargar
          </button>
          {enlaceLab && (
            <Link className="boton boton-primario" to={enlaceLab}>
              Abrir el laboratorio
            </Link>
          )}
        </div>
      </div>
      <div className="detalle-envio">
        <section className="detalle-codigo" aria-label="Código enviado">
          <Editor valor={datos.datos.codigo} soloLectura diagnosticos={diagnosticos} irA={irA} etiqueta={`Código del envío ${envio.id}`} />
        </section>
        <section className="detalle-resultado" aria-label="Resultado">
          {!terminado(envio) ? (
            <ProgresoEnvio envio={envio} />
          ) : envio.tipo === "evaluacion" ? (
            <ResultadoEvaluacion envio={envio} alIrALinea={(linea) => setIrA({ linea })} />
          ) : envio.tipo === "ejecucion" ? (
            <ResultadoEjecucion envio={envio} alIrALinea={(linea) => setIrA({ linea })} />
          ) : (
            <Veredicto clave={envio.resultado?.veredicto} grande />
          )}
        </section>
      </div>
    </div>
  );
}
