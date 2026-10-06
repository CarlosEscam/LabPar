import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useAvisar } from "../componentes/Notificaciones";
import { Aviso } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { fecha } from "../lib/formato";
import { useTitulo } from "../lib/ganchos";
import { useSesion, useUsuario } from "../lib/sesion";
import type { Usuario } from "../lib/tipos";

const NOMBRE_ROL = { estudiante: "Estudiante", docente: "Docente", admin: "Administrador" } as const;

export default function Perfil() {
  useTitulo("Mi perfil");
  const usuario = useUsuario();
  const { actualizar } = useSesion();
  const avisar = useAvisar();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [consentimiento, setConsentimiento] = useState(usuario.consentimiento_investigacion);

  const guardarDatos = async (e: FormEvent) => {
    e.preventDefault();
    setErrorDatos(null);
    try {
      actualizar(await api<Usuario>("/auth/yo", { metodo: "PATCH", cuerpo: { nombre } }));
      avisar("Datos actualizados.");
    } catch (err) {
      setErrorDatos(mensaje(err));
    }
  };
  const cambiarConsentimiento = async (valor: boolean) => {
    setConsentimiento(valor);
    try {
      actualizar(await api<Usuario>("/auth/yo", { metodo: "PATCH", cuerpo: { consentimiento_investigacion: valor } }));
      avisar(
        valor
          ? "Gracias: tus datos seudonimizados podrán usarse en la investigación."
          : "Retiraste la autorización. Tus datos no se incluirán en las próximas exportaciones.",
      );
    } catch (err) {
      setConsentimiento(!valor);
      avisar(mensaje(err), "error");
    }
  };
  const cambiarClave = async (e: FormEvent) => {
    e.preventDefault();
    setErrorClave(null);
    if (nueva.length < 8) return setErrorClave("La nueva contraseña debe tener al menos 8 caracteres.");
    if (nueva !== confirmacion) return setErrorClave("La confirmación no coincide con la nueva contraseña.");
    try {
      await api<Usuario>("/auth/yo", { metodo: "PATCH", cuerpo: { clave_actual: actual, clave_nueva: nueva } });
      setActual("");
      setNueva("");
      setConfirmacion("");
      avisar("Contraseña actualizada.");
    } catch (err) {
      setErrorClave(mensaje(err));
    }
  };

  return (
    <div className="contenedor pagina perfil">
      <div className="encabezado">
        <div>
          <h1>Mi perfil</h1>
          <p className="descripcion">
            {NOMBRE_ROL[usuario.rol]} desde el {fecha(usuario.creado_en, false)}.
          </p>
        </div>
      </div>
      <div className="pila" style={{ gap: 40, maxWidth: 640 }}>
        <section>
          <h2 className="titulo-seccion">Datos de la cuenta</h2>
          <form className="formulario" onSubmit={guardarDatos}>
            <div className="campo">
              <label htmlFor="perfil-nombre">Nombre completo</label>
              <input
                id="perfil-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                minLength={2}
                required
                autoComplete="name"
              />
            </div>
            <div className="campo">
              <label htmlFor="perfil-email">Correo</label>
              <input id="perfil-email" value={usuario.email} readOnly aria-describedby="ayuda-email" />
              <span id="ayuda-email" className="ayuda">
                El correo identifica tu cuenta; si necesitas cambiarlo, pídelo al administrador.
              </span>
            </div>
            {errorDatos && <Aviso tono="error">{errorDatos}</Aviso>}
            <div className="acciones">
              <button className="boton boton-primario" type="submit" disabled={nombre.trim() === usuario.nombre}>
                Guardar
              </button>
            </div>
          </form>
        </section>

        {usuario.rol === "estudiante" && (
          <section>
            <h2 className="titulo-seccion">Uso de tus datos en la investigación</h2>
            <label className="casilla">
              <input type="checkbox" checked={consentimiento} onChange={(e) => cambiarConsentimiento(e.target.checked)} />
              <span>
                Autorizo que mis registros de uso (envíos, resultados y tiempos), identificados con un seudónimo, se usen en la
                investigación del proyecto. Puedo retirar la autorización en cualquier momento y no afecta mis calificaciones. Más detalles
                en la <Link to="/privacidad">política de tratamiento de datos</Link>.
              </span>
            </label>
          </section>
        )}

        <section>
          <h2 className="titulo-seccion">Cambiar la contraseña</h2>
          <form className="formulario" onSubmit={cambiarClave}>
            <div className="campo">
              <label htmlFor="clave-actual">Contraseña actual</label>
              <input
                id="clave-actual"
                type="password"
                autoComplete="current-password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                required
              />
            </div>
            <div className="campos-2">
              <div className="campo">
                <label htmlFor="clave-nueva">Nueva contraseña</label>
                <input
                  id="clave-nueva"
                  type="password"
                  autoComplete="new-password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="clave-confirmar">Repite la nueva contraseña</label>
                <input
                  id="clave-confirmar"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  required
                />
              </div>
            </div>
            {errorClave && <Aviso tono="error">{errorClave}</Aviso>}
            <div className="acciones">
              <button className="boton" type="submit" disabled={!actual || !nueva}>
                Cambiar la contraseña
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
