import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Aviso } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { useCarga, useTitulo } from "../lib/ganchos";
import { useSesion } from "../lib/sesion";
import type { ConfigPublica } from "../lib/tipos";
import { PortadaAcceso } from "./Ingresar";

export default function Registro() {
  useTitulo("Crear cuenta");
  const { registrar } = useSesion();
  const navegar = useNavigate();
  const config = useCarga((senal) => api<ConfigPublica>("/auth/config-publica", { senal }), []);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [terminos, setTerminos] = useState(false);
  const [investigacion, setInvestigacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (config.datos && !config.datos.registro_abierto) {
    return (
      <PortadaAcceso>
        <div className="acceso-caja">
          <h2>El registro está cerrado</h2>
          <p className="descripcion">
            En esta instalación las cuentas las crea el administrador. Pide a tu docente que te registre y luego ingresa con tu correo.
          </p>
          <Link className="boton" to="/ingresar">
            Volver a ingresar
          </Link>
        </div>
      </PortadaAcceso>
    );
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clave.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!terminos) {
      setError("Para crear la cuenta debes aceptar los términos de uso y el tratamiento de tus datos.");
      return;
    }
    setEnviando(true);
    try {
      await registrar({
        nombre: nombre.trim(),
        email: email.trim(),
        clave,
        codigo_inscripcion: codigo.trim() || undefined,
        acepta_terminos: terminos,
        consentimiento_investigacion: investigacion,
      });
      navegar("/", { replace: true });
    } catch (err) {
      setError(mensaje(err));
      setEnviando(false);
    }
  };

  return (
    <PortadaAcceso>
      <div className="acceso-caja">
        <h2>Crear cuenta de estudiante</h2>
        <form className="formulario" onSubmit={enviar} noValidate>
          <div className="campo">
            <label htmlFor="nombre">Nombre completo</label>
            <input id="nombre" autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="email">Correo institucional</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <input
              id="clave"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-describedby="ayuda-clave"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
            <span id="ayuda-clave" className="ayuda">
              Mínimo 8 caracteres.
            </span>
          </div>
          <div className="campo">
            <label htmlFor="codigo">Código del curso (opcional)</label>
            <input
              id="codigo"
              autoComplete="off"
              aria-describedby="ayuda-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
              maxLength={16}
            />
            <span id="ayuda-codigo" className="ayuda">
              Te lo entrega tu docente. También puedes agregarlo después de crear la cuenta.
            </span>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={terminos} onChange={(e) => setTerminos(e.target.checked)} required />
            <span>
              Acepto los términos de uso y autorizo el tratamiento de mis datos personales para prestar el servicio, según la{" "}
              <Link to="/privacidad" target="_blank">
                política de tratamiento de datos
              </Link>{" "}
              (Ley 1581 de 2012).
            </span>
          </label>
          <label className="casilla">
            <input type="checkbox" checked={investigacion} onChange={(e) => setInvestigacion(e.target.checked)} />
            <span>
              <strong>Opcional.</strong> Autorizo que mis registros de uso (envíos, resultados y tiempos), identificados con un seudónimo,
              se usen en la investigación del proyecto. No afecta mis calificaciones y puedo retirar la autorización desde mi perfil.
            </span>
          </label>
          {error && <Aviso tono="error">{error}</Aviso>}
          <button className="boton boton-primario boton-ancho" type="submit" disabled={enviando}>
            {enviando ? "Creando la cuenta…" : "Crear cuenta"}
          </button>
        </form>
        <p className="meta">
          ¿Ya tienes cuenta? <Link to="/ingresar">Ingresa</Link>
        </p>
      </div>
    </PortadaAcceso>
  );
}
