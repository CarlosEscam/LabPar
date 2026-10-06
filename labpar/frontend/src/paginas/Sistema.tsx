import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Icono } from "../componentes/Icono";
import { useAvisar } from "../componentes/Notificaciones";
import { Aviso, Cargando, Dialogo, ErrorCarga, Pestanas, Vacio } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { haceCuanto, NOMBRE_MODELO, plural, segundos } from "../lib/formato";
import { useCarga, useIntervalo, useTitulo } from "../lib/ganchos";
import { useUsuario } from "../lib/sesion";
import type { EstadoSistema, Modelo, Rol, TrabajadorEstado, Usuario } from "../lib/tipos";
import { RecursosComputo } from "./Inicio";

const NOMBRE_ROL: Record<Rol, string> = { estudiante: "Estudiante", docente: "Docente", admin: "Administrador" };
const ESTADO_TRABAJADOR: Record<TrabajadorEstado["estado"], { texto: string; clase: string }> = {
  libre: { texto: "Libre", clase: "chip-ok" },
  ocupado: { texto: "Evaluando", clase: "chip-aviso" },
  detenido: { texto: "Detenido", clase: "chip-borde" },
  sin_respuesta: { texto: "Sin respuesta", clase: "chip-error" },
};

export default function Sistema() {
  useTitulo("Sistema");
  const usuario = useUsuario();
  const [parametros, setParametros] = useSearchParams();
  const seccion = usuario.rol === "admin" && parametros.get("seccion") === "usuarios" ? "usuarios" : "estado";
  return (
    <div className="contenedor pagina">
      <div className="encabezado">
        <div>
          <h1>Sistema</h1>
          <p className="descripcion">
            Estado de los nodos de cómputo locales que evalúan los envíos y, para el administrador, las cuentas de la plataforma.
          </p>
        </div>
      </div>
      {usuario.rol === "admin" && (
        <Pestanas
          etiqueta="Secciones"
          activa={seccion}
          alCambiar={(s) => setParametros(s === "estado" ? {} : { seccion: s }, { replace: true })}
          pestanas={[
            { id: "estado", texto: "Recursos de cómputo" },
            { id: "usuarios", texto: "Usuarios" },
          ]}
        />
      )}
      <div className="panel-pestana">{seccion === "estado" ? <EstadoRecursos /> : <Usuarios />}</div>
    </div>
  );
}

// ============================================================================= Estado de los trabajadores
function EstadoRecursos() {
  const usuario = useUsuario();
  const avisar = useAvisar();
  const estado = useCarga((senal) => api<EstadoSistema>("/admin/estado", { senal }), []);
  useIntervalo(() => estado.recargar(), 5000);
  const [reintentar, setReintentar] = useState("");

  if (estado.cargando && !estado.datos) return <Cargando />;
  if (estado.error && !estado.datos) return <ErrorCarga mensaje={estado.error} reintentar={estado.recargar} />;
  const e = estado.datos!;
  const enviarReintento = async (ev: FormEvent) => {
    ev.preventDefault();
    try {
      await api(`/admin/envios/${Number(reintentar)}/reintentar`, { metodo: "POST" });
      avisar(`El envío #${reintentar} volvió a la cola.`);
      setReintentar("");
      estado.recargar();
    } catch (err) {
      avisar(mensaje(err), "error");
    }
  };

  return (
    <div className="pila" style={{ gap: 28 }}>
      <div className="rejilla-2">
        <section className="panel panel-compacto">
          <h2 className="titulo-panel">Modelos disponibles</h2>
          <RecursosComputo estado={e} />
        </section>
        <section className="panel panel-compacto">
          <h2 className="titulo-panel">Cola de evaluación</h2>
          <dl className="lista-datos">
            <div>
              <dt>Pendientes</dt>
              <dd className="cifra">{e.cola.pendientes}</dd>
            </div>
            <div>
              <dt>En ejecución</dt>
              <dd className="cifra">{e.cola.ejecutando}</dd>
            </div>
            <div>
              <dt>Terminados en 24 h</dt>
              <dd className="cifra">{e.cola.completados_24h}</dd>
            </div>
            <div>
              <dt>Fallos del motor en 24 h</dt>
              <dd className="cifra">{e.cola.errores_24h}</dd>
            </div>
            <div>
              <dt>Espera media</dt>
              <dd className="cifra">{segundos(e.cola.espera_media_s)}</dd>
            </div>
            <div>
              <dt>Proceso medio</dt>
              <dd className="cifra">{segundos(e.cola.proceso_medio_s)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section>
        <header className="fila" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="titulo-seccion">Trabajadores del motor</h2>
          <span className="meta">Se actualiza cada 5 segundos. Versión {e.version}.</span>
        </header>
        {e.trabajadores.length === 0 ? (
          <Vacio titulo="No hay trabajadores registrados">
            Inicia al menos un proceso con <code>python -m labpar.worker</code> o el servicio <code>trabajador</code> de Docker Compose. Los
            envíos esperan en la cola hasta entonces.
          </Vacio>
        ) : (
          <div className="tabla-marco">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Estado</th>
                  <th>Capacidades</th>
                  <th className="num">Procesados</th>
                  <th className="num">Fallidos</th>
                  <th>Último latido</th>
                </tr>
              </thead>
              <tbody>
                {e.trabajadores.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.id}</strong>
                      <div className="meta">
                        PID {t.pid}, desde {haceCuanto(t.iniciado_en)}
                      </div>
                    </td>
                    <td>
                      <span className={`chip ${ESTADO_TRABAJADOR[t.estado].clase}`}>{ESTADO_TRABAJADOR[t.estado].texto}</span>
                      {t.envio_actual && <div className="meta">Envío #{t.envio_actual}</div>}
                    </td>
                    <td>
                      <div className="fila" style={{ gap: 6 }}>
                        <span className="chip chip-borde">{plural(t.capacidades.nucleos ?? 0, "núcleo")}</span>
                        {(["openmp", "mpi", "cuda"] as Modelo[]).map((m) => (
                          <span
                            key={m}
                            className={t.capacidades[m]?.disponible ? `chip chip-${m}` : "chip chip-borde tachado"}
                            title={t.capacidades[m]?.detalle}
                          >
                            {NOMBRE_MODELO[m]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num">{t.procesados}</td>
                    <td className="num">{t.fallidos}</td>
                    <td className="meta">hace {segundos(t.segundos_desde_latido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {usuario.rol === "admin" && (
        <section>
          <h2 className="titulo-seccion">Reintentar un envío</h2>
          <p className="meta">Devuelve a la cola un envío que quedó con error interno, por ejemplo tras reiniciar un nodo.</p>
          <form className="fila" onSubmit={enviarReintento} style={{ marginTop: 10 }}>
            <label htmlFor="reintentar" className="oculto-visual">
              Número de envío
            </label>
            <input
              id="reintentar"
              className="entrada"
              style={{ width: 160 }}
              type="number"
              min={1}
              placeholder="Número de envío"
              value={reintentar}
              onChange={(ev) => setReintentar(ev.target.value)}
            />
            <button className="boton" type="submit" disabled={!reintentar}>
              <Icono nombre="actualizar" /> Reintentar
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

// ============================================================================= Usuarios (administrador)
function Usuarios() {
  const yo = useUsuario();
  const avisar = useAvisar();
  const [rol, setRol] = useState<"" | Rol>("");
  const [q, setQ] = useState("");
  const consulta = `/admin/usuarios?${new URLSearchParams({ ...(rol ? { rol } : {}), ...(q.trim() ? { q: q.trim() } : {}) })}`;
  const usuarios = useCarga((senal) => api<Usuario[]>(consulta, { senal }), [consulta]);
  const [crear, setCrear] = useState(false);
  const [claveDe, setClaveDe] = useState<Usuario | null>(null);

  const actualizar = async (u: Usuario, cambios: Partial<Pick<Usuario, "rol" | "activo">>) => {
    try {
      const nuevo = await api<Usuario>(`/admin/usuarios/${u.id}`, { metodo: "PATCH", cuerpo: cambios });
      usuarios.fijar((lista) => (lista ?? []).map((x) => (x.id === u.id ? nuevo : x)));
      avisar(`Cuenta de ${u.nombre} actualizada.`);
    } catch (e) {
      avisar(mensaje(e), "error");
    }
  };

  return (
    <div className="pila" style={{ gap: 18 }}>
      <div className="filtros">
        <div className="campo campo-busqueda">
          <label htmlFor="buscar-usuario" className="oculto-visual">
            Buscar
          </label>
          <input
            id="buscar-usuario"
            type="search"
            placeholder="Buscar por nombre o correo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="filtro-rol" className="oculto-visual">
            Rol
          </label>
          <select id="filtro-rol" value={rol} onChange={(e) => setRol(e.target.value as "" | Rol)}>
            <option value="">Todos los roles</option>
            <option value="estudiante">Estudiantes</option>
            <option value="docente">Docentes</option>
            <option value="admin">Administradores</option>
          </select>
        </div>
        <button className="boton boton-primario" onClick={() => setCrear(true)} style={{ marginLeft: "auto" }}>
          <Icono nombre="mas" /> Crear cuenta
        </button>
      </div>
      {usuarios.cargando && !usuarios.datos && <Cargando />}
      {usuarios.error && <ErrorCarga mensaje={usuarios.error} reintentar={usuarios.recargar} />}
      {usuarios.datos && (
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Activa</th>
                <th>Último ingreso</th>
                <th>
                  <span className="oculto-visual">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.datos.map((u) => (
                <tr key={u.id} className={u.activo ? undefined : "fila-inactiva"}>
                  <td>
                    <strong>{u.nombre}</strong>
                    <div className="meta">{u.email}</div>
                  </td>
                  <td>
                    <select
                      className="entrada entrada-chica"
                      value={u.rol}
                      onChange={(e) => actualizar(u, { rol: e.target.value as Rol })}
                      disabled={u.id === yo.id}
                      aria-label={`Rol de ${u.nombre}`}
                    >
                      {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
                        <option key={r} value={r}>
                          {NOMBRE_ROL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="interruptor interruptor-chico">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={u.activo}
                        disabled={u.id === yo.id}
                        onChange={(e) => actualizar(u, { activo: e.target.checked })}
                        aria-label={`Cuenta de ${u.nombre} activa`}
                      />
                      <span>{u.activo ? "Sí" : "No"}</span>
                    </label>
                  </td>
                  <td className="meta">{u.ultimo_ingreso ? haceCuanto(u.ultimo_ingreso) : "Nunca"}</td>
                  <td className="num">
                    <button className="boton boton-chico boton-sutil" onClick={() => setClaveDe(u)}>
                      <Icono nombre="candado" tamano={15} /> Nueva contraseña
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {crear && (
        <DialogoCrearUsuario
          alCerrar={() => setCrear(false)}
          alCrear={(u) => {
            setCrear(false);
            avisar(`Cuenta creada para ${u.nombre}.`);
            usuarios.recargar();
          }}
        />
      )}
      {claveDe && <DialogoClave usuario={claveDe} alCerrar={() => setClaveDe(null)} />}
    </div>
  );
}

function DialogoCrearUsuario({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (u: Usuario) => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [rol, setRol] = useState<Rol>("docente");
  const [error, setError] = useState<string | null>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      alCrear(await api<Usuario>("/admin/usuarios", { metodo: "POST", cuerpo: { nombre, email, clave, rol } }));
    } catch (err) {
      setError(mensaje(err));
    }
  };
  return (
    <Dialogo
      abierto
      alCerrar={alCerrar}
      titulo="Crear una cuenta"
      descripcion="Útil para docentes o cuando el registro abierto está desactivado. Comunica la contraseña por un canal seguro."
    >
      <form className="formulario" onSubmit={enviar}>
        <div className="campo">
          <label htmlFor="nu-nombre">Nombre completo</label>
          <input id="nu-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} />
        </div>
        <div className="campo">
          <label htmlFor="nu-email">Correo</label>
          <input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="campos-2">
          <div className="campo">
            <label htmlFor="nu-clave">Contraseña inicial</label>
            <input
              id="nu-clave"
              type="text"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              minLength={8}
              required
              autoComplete="off"
            />
          </div>
          <div className="campo">
            <label htmlFor="nu-rol">Rol</label>
            <select id="nu-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              <option value="estudiante">Estudiante</option>
              <option value="docente">Docente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="acciones">
          <button className="boton boton-primario" type="submit">
            Crear cuenta
          </button>
          <button className="boton boton-sutil" type="button" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

function DialogoClave({ usuario, alCerrar }: { usuario: Usuario; alCerrar: () => void }) {
  const avisar = useAvisar();
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/admin/usuarios/${usuario.id}`, { metodo: "PATCH", cuerpo: { clave } });
      avisar(`Se cambió la contraseña de ${usuario.nombre}.`);
      alCerrar();
    } catch (err) {
      setError(mensaje(err));
    }
  };
  return (
    <Dialogo abierto alCerrar={alCerrar} titulo={`Nueva contraseña para ${usuario.nombre}`}>
      <form className="formulario" onSubmit={enviar}>
        <div className="campo">
          <label htmlFor="nueva-clave">Contraseña</label>
          <input
            id="nueva-clave"
            type="text"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            minLength={8}
            required
            autoComplete="off"
          />
          <span className="ayuda">Pídele que la cambie desde su perfil al ingresar.</span>
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className="acciones">
          <button className="boton boton-primario" type="submit">
            Cambiar la contraseña
          </button>
          <button className="boton boton-sutil" type="button" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
