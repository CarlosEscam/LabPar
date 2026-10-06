import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icono } from "../componentes/Icono";
import { useAvisar } from "../componentes/Notificaciones";
import { Cargando, ChipNivel, ErrorCarga, Segmentado, Vacio } from "../componentes/UI";
import { api, guardarBlob, mensaje } from "../lib/api";
import { NOMBRE_MODELO } from "../lib/formato";
import { useCarga, usePersistente, useTitulo } from "../lib/ganchos";
import { useUsuario } from "../lib/sesion";
import type { LabDocente, LabResumen, Modelo } from "../lib/tipos";

type Filtro = "todos" | Modelo;

export default function Banco() {
  useTitulo("Banco de laboratorios");
  const usuario = useUsuario();
  const avisar = useAvisar();
  const navegar = useNavigate();
  const labs = useCarga((senal) => api<LabResumen[]>("/laboratorios", { senal }), []);
  const [filtro, setFiltro] = usePersistente<Filtro>("labpar.banco.filtro", "todos");
  const [busqueda, setBusqueda] = useState("");
  const [soloMios, setSoloMios] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const puedeEditar = (l: LabResumen) => usuario.rol === "admin" || l.autor_id === usuario.id;

  const duplicar = async (l: LabResumen) => {
    try {
      const copia = await api<LabDocente>(`/laboratorios/${l.id}/duplicar`, { metodo: "POST" });
      avisar(`Se creó «${copia.titulo}». Ya puedes editarlo.`);
      navegar(`/laboratorios/${copia.id}/editar`);
    } catch (e) {
      avisar(mensaje(e), "error");
    }
  };
  const exportar = async (l: LabResumen) => {
    try {
      const paquete = await api<unknown>(`/laboratorios/${l.id}/exportar`);
      guardarBlob(new Blob([JSON.stringify(paquete, null, 2)], { type: "application/json" }), `${l.slug}.labpar.json`);
    } catch (e) {
      avisar(mensaje(e), "error");
    }
  };
  const importar = async (f: File) => {
    try {
      const paquete = JSON.parse(await f.text());
      const lab = await api<LabDocente>("/laboratorios/importar", { metodo: "POST", cuerpo: paquete });
      avisar(`Se importó «${lab.titulo}».`);
      navegar(`/laboratorios/${lab.id}/editar`);
    } catch (e) {
      avisar(e instanceof SyntaxError ? "El archivo no es un JSON válido." : mensaje(e), "error");
    }
  };

  const texto = busqueda.trim().toLowerCase();
  const lista = (labs.datos ?? []).filter(
    (l) =>
      (filtro === "todos" || l.modelo === filtro) &&
      (!soloMios || l.autor_id === usuario.id) &&
      (!texto ||
        l.titulo.toLowerCase().includes(texto) ||
        l.resumen.toLowerCase().includes(texto) ||
        l.conceptos.some((c) => c.toLowerCase().includes(texto))),
  );
  const modelos = (["openmp", "mpi", "cuda"] as Modelo[]).filter((m) => lista.some((l) => l.modelo === m));

  return (
    <div className="contenedor pagina">
      <div className="encabezado">
        <div>
          <h1>Banco de laboratorios</h1>
          <p className="descripcion">
            Laboratorios listos para asignar, con enunciado, plantilla, casos de prueba y solución de referencia. Los del banco
            institucional se duplican para adaptarlos; los tuyos se editan directamente.
          </p>
        </div>
        <div className="acciones">
          <input
            ref={archivo}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importar(f);
              e.target.value = "";
            }}
          />
          <button className="boton" onClick={() => archivo.current?.click()}>
            <Icono nombre="subir" /> Importar
          </button>
          <Link className="boton boton-primario" to="/laboratorios/nuevo">
            <Icono nombre="mas" /> Crear laboratorio
          </Link>
        </div>
      </div>

      <div className="filtros">
        <Segmentado<Filtro>
          etiqueta="Filtrar por modelo"
          opciones={["todos", "openmp", "mpi", "cuda"]}
          valor={filtro}
          alCambiar={setFiltro}
          formato={(v) => (v === "todos" ? "Todos" : NOMBRE_MODELO[v])}
        />
        <div className="campo campo-busqueda">
          <label htmlFor="buscar-lab" className="oculto-visual">
            Buscar
          </label>
          <input
            id="buscar-lab"
            type="search"
            placeholder="Buscar por título o concepto"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <label className="casilla" style={{ alignItems: "center" }}>
          <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)} />
          <span>Solo los míos</span>
        </label>
      </div>

      {labs.cargando && !labs.datos && <Cargando />}
      {labs.error && <ErrorCarga mensaje={labs.error} reintentar={labs.recargar} />}
      {labs.datos && lista.length === 0 && (
        <Vacio titulo="No hay laboratorios con estos filtros">Cambia el filtro o crea un laboratorio nuevo.</Vacio>
      )}
      {modelos.map((m) => (
        <section key={m} className="seccion">
          <h2>{NOMBRE_MODELO[m]}</h2>
          <ul className="banco">
            {lista
              .filter((l) => l.modelo === m)
              .map((l) => (
                <li key={l.id} className={`banco-lab fila-lab-${l.modelo}`}>
                  <div className="banco-texto">
                    <div className="fila" style={{ gap: 8 }}>
                      <Link to={`/laboratorios/${l.id}`} className="banco-titulo">
                        {l.titulo}
                      </Link>
                      {!l.publicado && <span className="chip chip-aviso">Borrador</span>}
                      {!l.del_banco && <span className="chip chip-borde">{l.autor_id === usuario.id ? "Tuyo" : "De otro docente"}</span>}
                    </div>
                    <p className="meta">{l.resumen}</p>
                    <div className="fila" style={{ gap: 6 }}>
                      <ChipNivel nivel={l.nivel} />
                      <span className="meta">{l.duracion_estimada_min} min</span>
                      {l.conceptos.slice(0, 4).map((c) => (
                        <span key={c} className="concepto">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="banco-acciones">
                    <Link className="boton boton-chico" to={`/laboratorios/${l.id}`}>
                      <Icono nombre="ejecutar" tamano={15} /> Probar
                    </Link>
                    {puedeEditar(l) ? (
                      <Link className="boton boton-chico" to={`/laboratorios/${l.id}/editar`}>
                        <Icono nombre="editar" tamano={15} /> Editar
                      </Link>
                    ) : (
                      <button className="boton boton-chico" onClick={() => duplicar(l)}>
                        <Icono nombre="duplicar" tamano={15} /> Duplicar
                      </button>
                    )}
                    <button
                      className="boton boton-chico boton-sutil"
                      onClick={() => exportar(l)}
                      title="Descargar como archivo JSON"
                      aria-label={`Exportar ${l.titulo}`}
                    >
                      <Icono nombre="descargar" tamano={15} />
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
