import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icono } from "./Icono";

type Tono = "ok" | "error" | "info";
interface Notificacion {
  id: number;
  texto: string;
  tono: Tono;
}

const Contexto = createContext<(texto: string, tono?: Tono) => void>(() => {});

export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([]);
  const siguiente = useRef(1);

  const quitar = useCallback((id: number) => setLista((l) => l.filter((n) => n.id !== id)), []);
  const avisar = useCallback(
    (texto: string, tono: Tono = "ok") => {
      const id = siguiente.current++;
      setLista((l) => [...l.slice(-3), { id, texto, tono }]);
      window.setTimeout(() => quitar(id), tono === "error" ? 8000 : 4500);
    },
    [quitar],
  );
  const valor = useMemo(() => avisar, [avisar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="notificaciones" aria-live="polite" aria-atomic="false">
        {lista.map((n) => (
          <div key={n.id} className="notificacion" role={n.tono === "error" ? "alert" : "status"}>
            <span style={{ color: n.tono === "ok" ? "var(--ok-texto)" : n.tono === "error" ? "var(--error-texto)" : "var(--grafito)" }}>
              <Icono nombre={n.tono === "ok" ? "check" : n.tono === "error" ? "exclamacion" : "info"} />
            </span>
            <span>{n.texto}</span>
            <button onClick={() => quitar(n.id)} aria-label="Cerrar notificación">
              <Icono nombre="cerrar" tamano={16} />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisar() {
  return useContext(Contexto);
}
