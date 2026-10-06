import { useEffect, useId, useRef, type ReactNode } from "react";
import { NOMBRE_MODELO, NOMBRE_NIVEL, veredicto as datosVeredicto, type TonoVeredicto } from "../lib/formato";
import type { Modelo, Nivel } from "../lib/tipos";
import { Icono, type NombreIcono } from "./Icono";

export function ChipModelo({ modelo }: { modelo: Modelo }) {
  return <span className={`chip chip-${modelo}`}>{NOMBRE_MODELO[modelo]}</span>;
}

export function ChipNivel({ nivel }: { nivel: Nivel }) {
  return <span className="chip chip-borde">{NOMBRE_NIVEL[nivel]}</span>;
}

const ICONO_TONO: Record<TonoVeredicto, NombreIcono> = {
  ok: "check",
  error: "cruz",
  aviso: "alerta",
  neutro: "info",
  proceso: "reloj",
};

export function Veredicto({ clave, grande = false }: { clave: string | null | undefined; grande?: boolean }) {
  const { etiqueta, tono } = datosVeredicto(clave);
  return (
    <span className={`veredicto veredicto-${tono}${grande ? " veredicto-grande" : ""}`}>
      {tono === "proceso" ? (
        <span className="giro" aria-hidden="true" />
      ) : (
        <Icono nombre={ICONO_TONO[tono]} tamano={grande ? 22 : 16} grosor={2.4} />
      )}
      {etiqueta}
    </span>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <span className="giro" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div className="aviso aviso-error" role="alert">
      <Icono nombre="exclamacion" />
      <div className="pila" style={{ gap: 10 }}>
        <span>{mensaje}</span>
        {reintentar && (
          <div>
            <button className="boton boton-chico" onClick={reintentar}>
              <Icono nombre="actualizar" tamano={16} />
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Aviso({
  tono = "info",
  titulo,
  children,
}: {
  tono?: "info" | "ok" | "error" | "aviso";
  titulo?: string;
  children: ReactNode;
}) {
  const icono: NombreIcono = tono === "ok" ? "check" : tono === "error" ? "exclamacion" : tono === "aviso" ? "alerta" : "info";
  return (
    <div className={`aviso${tono === "info" ? "" : ` aviso-${tono}`}`} role={tono === "error" ? "alert" : undefined}>
      <Icono nombre={icono} />
      <div>
        {titulo && <strong>{titulo}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="vacio">
      <h3>{titulo}</h3>
      {children && <p style={{ maxWidth: "60ch" }}>{children}</p>}
      {accion}
    </div>
  );
}

export function BarraProgreso({ valor, total, etiqueta }: { valor: number; total: number; etiqueta: string }) {
  const f = total > 0 ? Math.min(1, valor / total) : 0;
  return (
    <div className="barra-progreso" role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={total} aria-valuenow={valor}>
      <span style={{ width: `${f * 100}%` }} />
    </div>
  );
}

export function Segmentado<T extends string | number>({
  opciones,
  valor,
  alCambiar,
  etiqueta,
  formato = (v) => String(v),
}: {
  opciones: readonly T[];
  valor: T;
  alCambiar: (v: T) => void;
  etiqueta: string;
  formato?: (v: T) => string;
}) {
  return (
    <div className="segmentado" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={String(o)} type="button" aria-pressed={o === valor} onClick={() => alCambiar(o)}>
          {formato(o)}
        </button>
      ))}
    </div>
  );
}

interface PropsDialogo {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  pie?: ReactNode;
  ancho?: boolean;
}

/** Diálogo modal nativo (<dialog>): atrapa el foco, se cierra con Esc y al hacer clic fuera. */
export function Dialogo({ abierto, alCerrar, titulo, descripcion, children, pie, ancho }: PropsDialogo) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      className={`dialogo${ancho ? " dialogo-ancho" : ""}`}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      onClick={(e) => {
        if (e.target === ref.current) alCerrar();
      }}
    >
      {abierto && (
        <>
          <div className="dialogo-cuerpo">
            <div className="dialogo-cabeza">
              <div className="pila" style={{ gap: 6 }}>
                <h2 id={idTitulo} style={{ fontSize: "1.3125rem" }}>
                  {titulo}
                </h2>
                {descripcion && <p className="meta">{descripcion}</p>}
              </div>
              <button type="button" className="boton boton-sutil boton-icono" onClick={alCerrar} aria-label="Cerrar">
                <Icono nombre="cerrar" />
              </button>
            </div>
            {children}
          </div>
          {pie && <div className="dialogo-pie">{pie}</div>}
        </>
      )}
    </dialog>
  );
}

/** Pestañas accesibles controladas por el componente padre. */
export function Pestanas<T extends string>({
  pestanas,
  activa,
  alCambiar,
  etiqueta,
}: {
  pestanas: { id: T; texto: string; contador?: number }[];
  activa: T;
  alCambiar: (id: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="pestanas" role="tablist" aria-label={etiqueta}>
      {pestanas.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          id={`pestana-${p.id}`}
          aria-selected={p.id === activa}
          aria-controls={`panel-${p.id}`}
          tabIndex={p.id === activa ? 0 : -1}
          onClick={() => alCambiar(p.id)}
          onKeyDown={(e) => {
            const i = pestanas.findIndex((x) => x.id === activa);
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const siguiente = pestanas[(i + (e.key === "ArrowRight" ? 1 : pestanas.length - 1)) % pestanas.length];
              alCambiar(siguiente.id);
              document.getElementById(`pestana-${siguiente.id}`)?.focus();
            }
          }}
        >
          {p.texto}
          {p.contador !== undefined && <span className="contador">{p.contador}</span>}
        </button>
      ))}
    </div>
  );
}
