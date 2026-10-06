import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { iniciales } from "../lib/formato";
import { esPersonal, useSesion, useUsuario } from "../lib/sesion";
import { Icono } from "./Icono";
import { Logotipo } from "./Marca";

const NOMBRE_ROL = { estudiante: "Estudiante", docente: "Docente", admin: "Administrador" } as const;

function temaEfectivo(): "claro" | "oscuro" {
  const fijado = document.documentElement.dataset.tema;
  if (fijado === "claro" || fijado === "oscuro") return fijado;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

function BotonTema() {
  const [tema, setTema] = useState<"claro" | "oscuro">(temaEfectivo);
  const cambiar = () => {
    const nuevo = tema === "oscuro" ? "claro" : "oscuro";
    document.documentElement.dataset.tema = nuevo;
    try {
      localStorage.setItem("labpar.tema", nuevo);
    } catch {
      /* sin almacenamiento */
    }
    setTema(nuevo);
    window.dispatchEvent(new Event("labpar:tema"));
  };
  return (
    <button
      className="boton boton-sutil boton-icono"
      onClick={cambiar}
      aria-label={tema === "oscuro" ? "Usar tema claro" : "Usar tema oscuro"}
      title={tema === "oscuro" ? "Tema claro" : "Tema oscuro"}
    >
      <Icono nombre={tema === "oscuro" ? "sol" : "luna"} />
    </button>
  );
}

function MenuUsuario() {
  const usuario = useUsuario();
  const { salir } = useSesion();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div className="usuario-barra" ref={ref}>
      <button className="boton-usuario" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <span className="avatar" aria-hidden="true">
          {iniciales(usuario.nombre)}
        </span>
        <span className="nombre-usuario">{usuario.nombre.split(" ")[0]}</span>
        <Icono nombre="abajo" tamano={14} />
      </button>
      {abierto && (
        <div className="menu" role="menu">
          <div className="menu-cabeza">
            <div style={{ fontWeight: 650 }}>{usuario.nombre}</div>
            <div className="meta">{usuario.email}</div>
            <div className="meta">{NOMBRE_ROL[usuario.rol]}</div>
          </div>
          <Link role="menuitem" to="/perfil">
            <Icono nombre="usuario" /> Mi perfil
          </Link>
          <Link role="menuitem" to="/privacidad">
            <Icono nombre="candado" /> Tratamiento de datos
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              salir();
              navegar("/ingresar");
            }}
          >
            <Icono nombre="salir" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Marco() {
  const usuario = useUsuario();
  const personal = esPersonal(usuario);
  const { pathname } = useLocation();
  const espacioTrabajo = /\/laboratorios\/\d+$/.test(pathname) || /\/cursos\/\d+\/laboratorios\/\d+/.test(pathname);

  return (
    <div className={espacioTrabajo ? "marco marco-trabajo" : "marco"}>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <header className="barra">
        <Link to="/" className="barra-marca" aria-label="LabPar, inicio">
          <Logotipo />
        </Link>
        <nav className="barra-nav" aria-label="Principal">
          <NavLink to="/" end>
            Inicio
          </NavLink>
          {personal && <NavLink to="/laboratorios">Banco de laboratorios</NavLink>}
          <NavLink to="/simulador">Simulador</NavLink>
          {personal && <NavLink to="/sistema">Sistema</NavLink>}
        </nav>
        <div className="barra-derecha">
          <BotonTema />
          <MenuUsuario />
        </div>
      </header>
      <main id="contenido" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
