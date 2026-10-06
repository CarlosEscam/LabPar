import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CurvasAmdahl } from "../componentes/CurvasAmdahl";
import { Icono } from "../componentes/Icono";
import { Logotipo } from "../componentes/Marca";
import { Aviso } from "../componentes/UI";
import { api, mensaje } from "../lib/api";
import { useCarga, useTitulo } from "../lib/ganchos";
import { useSesion } from "../lib/sesion";
import type { ConfigPublica } from "../lib/tipos";

export function PortadaAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="acceso">
      <section className="acceso-portada papel-cuadriculado" aria-label="Presentación de LabPar">
        <Logotipo />
        <div className="acceso-titular">
          <h1>Programación paralela con los equipos de la Universidad</h1>
          <p>
            Escribe programas con OpenMP, MPI y CUDA, ejecútalos en los nodos de cómputo locales y recibe en segundos la corrección, la
            aceleración medida y una explicación de los errores.
          </p>
        </div>
        <figure className="acceso-figura">
          <CurvasAmdahl />
          <figcaption>
            Ley de Amdahl: si una fracción <i>f</i> del programa es secuencial, la aceleración nunca supera 1/<i>f</i>, sin importar cuántos
            procesadores se usen.
          </figcaption>
        </figure>
      </section>
      <section className="acceso-formulario">{children}</section>
    </div>
  );
}

export default function Ingresar() {
  useTitulo("Ingresar");
  const { ingresar, expirada } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const desde = (ubicacion.state as { desde?: string } | null)?.desde ?? "/";
  const config = useCarga((senal) => api<ConfigPublica>("/auth/config-publica", { senal }), []);
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await ingresar(email.trim(), clave);
      navegar(desde, { replace: true });
    } catch (err) {
      setError(mensaje(err));
      setEnviando(false);
    }
  };

  return (
    <PortadaAcceso>
      <div className="acceso-caja">
        <h2>Ingresar</h2>
        {expirada && !error && <Aviso tono="aviso">Tu sesión expiró. Ingresa de nuevo para continuar.</Aviso>}
        <form className="formulario" onSubmit={enviar} noValidate>
          <div className="campo">
            <label htmlFor="email">Correo institucional</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
            />
          </div>
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <input
              id="clave"
              type="password"
              autoComplete="current-password"
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              aria-invalid={!!error}
            />
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          <button className="boton boton-primario boton-ancho" type="submit" disabled={enviando || !email || !clave}>
            {enviando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
        {config.datos?.registro_abierto !== false && (
          <p className="meta">
            ¿Es tu primera vez? <Link to="/registro">Crea tu cuenta de estudiante</Link> con el código que te dio tu docente.
          </p>
        )}
        {config.datos?.demo && config.datos.cuentas_demo.length > 0 && (
          <div className="cuentas-demo">
            <h3>Cuentas de demostración</h3>
            <p className="meta">Esta instalación está en modo de demostración. Elige un rol para llenar el formulario.</p>
            <ul>
              {config.datos.cuentas_demo.map((c) => (
                <li key={c.email}>
                  <button
                    type="button"
                    className="boton boton-chico"
                    onClick={() => {
                      setEmail(c.email);
                      setClave(c.clave);
                      setError(null);
                    }}
                  >
                    <Icono nombre="usuario" tamano={16} />
                    {c.rol}
                  </button>
                  <span className="meta">{c.email}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="acceso-legal meta">
          <Link to="/privacidad">Tratamiento de datos personales</Link>
          {config.datos && <span>Versión {config.datos.version}</span>}
        </div>
      </div>
    </PortadaAcceso>
  );
}
