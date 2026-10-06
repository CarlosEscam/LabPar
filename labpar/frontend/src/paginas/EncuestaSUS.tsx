import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { Icono } from "../componentes/Icono";
import { Aviso, Cargando, ErrorCarga } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { useCarga, useTitulo } from "../lib/ganchos";
import { ESCALA_SUS, ITEMS_SUS } from "../lib/sus";
import type { Curso, EstadoSUS } from "../lib/tipos";

export default function EncuestaSUS() {
  useTitulo("Encuesta de usabilidad");
  const { cursoId } = useParams();
  const id = Number(cursoId);
  const datos = useCarga(
    async (senal) => {
      const [curso, estado] = await Promise.all([api<Curso>(`/cursos/${id}`, { senal }), api<EstadoSUS>(`/sus/${id}`, { senal })]);
      return { curso, estado };
    },
    [id],
  );
  const [respuestas, setRespuestas] = useState<(number | null)[]>(() => Array(10).fill(null));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const faltantes = respuestas.map((r, i) => (r === null ? i + 1 : null)).filter((x): x is number => x !== null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (faltantes.length) {
      setError(`Falta responder ${faltantes.length === 1 ? "la afirmación" : "las afirmaciones"} ${faltantes.join(", ")}.`);
      document.getElementById(`item-sus-${faltantes[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api(`/sus/${id}`, { metodo: "POST", cuerpo: { respuestas } });
      setEnviada(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setEnviando(false);
    }
  };

  if (datos.cargando && !datos.datos)
    return (
      <div className="contenedor pagina">
        <Cargando />
      </div>
    );
  if (datos.error || !datos.datos)
    return (
      <div className="contenedor pagina">
        <ErrorCarga mensaje={datos.error ?? "Error"} reintentar={datos.recargar} />
      </div>
    );
  const { curso, estado } = datos.datos;
  const volver = (
    <Link className="boton" to={`/cursos/${curso.id}`}>
      <Icono nombre="izquierda" /> Volver al curso
    </Link>
  );

  return (
    <div className="contenedor pagina encuesta">
      <nav className="migas" aria-label="Ruta">
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/cursos/${curso.id}`}>{curso.nombre}</Link>
        <span aria-hidden="true">/</span>
        <span>Encuesta</span>
      </nav>
      <div className="encabezado" style={{ marginTop: 12 }}>
        <div>
          <h1>¿Qué tan fácil de usar te pareció LabPar?</h1>
          <p className="descripcion">
            Marca qué tan de acuerdo estás con cada afirmación según tu experiencia en este curso. No hay respuestas correctas, las
            respuestas se analizan de forma agregada y no afectan tu calificación. Toma unos dos minutos.
          </p>
        </div>
      </div>
      {enviada || estado.respondida ? (
        <div className="pila" style={{ maxWidth: 640 }}>
          <Aviso tono="ok" titulo="Gracias por responder">
            Tu respuesta quedó registrada. Ayuda a evaluar y mejorar la plataforma.
          </Aviso>
          <div>{volver}</div>
        </div>
      ) : !estado.activa ? (
        <div className="pila" style={{ maxWidth: 640 }}>
          <Aviso titulo="La encuesta no está abierta">Tu docente la activará al final del periodo de prácticas.</Aviso>
          <div>{volver}</div>
        </div>
      ) : (
        <form className="formulario-sus" onSubmit={enviar} noValidate>
          <ol className="items-encuesta">
            {ITEMS_SUS.map((texto, i) => (
              <li key={i} id={`item-sus-${i + 1}`} className={error && respuestas[i] === null ? "item-pendiente" : undefined}>
                <fieldset>
                  <legend>
                    <span className="item-numero cifra">{i + 1}</span>
                    {texto}
                  </legend>
                  <div className="escala-likert">
                    {ESCALA_SUS.map((op) => (
                      <label key={op.valor} className="likert-opcion" title={op.texto}>
                        <input
                          type="radio"
                          name={`sus-${i}`}
                          value={op.valor}
                          checked={respuestas[i] === op.valor}
                          onChange={() => setRespuestas(respuestas.map((r, j) => (j === i ? op.valor : r)))}
                          aria-label={`${op.valor}: ${op.texto}`}
                        />
                        <span className="likert-valor cifra">{op.valor}</span>
                      </label>
                    ))}
                  </div>
                  <div className="likert-extremos meta" aria-hidden="true">
                    <span>Totalmente en desacuerdo</span>
                    <span>Totalmente de acuerdo</span>
                  </div>
                </fieldset>
              </li>
            ))}
          </ol>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="fila" style={{ gap: 16 }}>
            <button className="boton boton-primario" type="submit" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar respuestas"}
            </button>
            <span className="meta cifra">{10 - faltantes.length} de 10 respondidas</span>
          </div>
        </form>
      )}
    </div>
  );
}
