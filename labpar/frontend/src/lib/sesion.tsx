import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { alExpirar, api, fijarToken, hayToken } from "./api";
import type { TokenOut, Usuario } from "./tipos";

export interface DatosRegistro {
  nombre: string;
  email: string;
  clave: string;
  codigo_inscripcion?: string;
  acepta_terminos: boolean;
  consentimiento_investigacion: boolean;
}

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  expirada: boolean;
  ingresar: (email: string, clave: string) => Promise<Usuario>;
  registrar: (datos: DatosRegistro) => Promise<Usuario>;
  salir: () => void;
  actualizar: (usuario: Usuario) => void;
}

const ContextoSesion = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(hayToken());
  const [expirada, setExpirada] = useState(false);

  const salir = useCallback(() => {
    fijarToken(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    alExpirar(() => {
      fijarToken(null);
      setUsuario(null);
      setExpirada(true);
    });
    if (!hayToken()) return;
    let vigente = true;
    api<Usuario>("/auth/yo")
      .then((u) => vigente && setUsuario(u))
      .catch(() => vigente && fijarToken(null))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
      alExpirar(null);
    };
  }, []);

  const ingresar = useCallback(async (email: string, clave: string) => {
    const r = await api<TokenOut>("/auth/ingresar", { metodo: "POST", cuerpo: { email, clave } });
    fijarToken(r.token);
    setExpirada(false);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const registrar = useCallback(async (datos: DatosRegistro) => {
    const r = await api<TokenOut>("/auth/registro", { metodo: "POST", cuerpo: datos });
    fijarToken(r.token);
    setExpirada(false);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const valor = useMemo<Sesion>(
    () => ({ usuario, cargando, expirada, ingresar, registrar, salir, actualizar: setUsuario }),
    [usuario, cargando, expirada, ingresar, registrar, salir],
  );
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(ContextoSesion);
  if (!s) throw new Error("useSesion debe usarse dentro de ProveedorSesion");
  return s;
}

/** Usuario autenticado (solo en rutas protegidas). */
export function useUsuario(): Usuario {
  const { usuario } = useSesion();
  if (!usuario) throw new Error("No hay sesión activa");
  return usuario;
}

export function esPersonal(u: Usuario | null): boolean {
  return u?.rol === "docente" || u?.rol === "admin";
}
