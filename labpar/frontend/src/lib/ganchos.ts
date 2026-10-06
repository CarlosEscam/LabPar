import { useCallback, useEffect, useRef, useState, type DependencyList, type PointerEvent as EventoPuntero, type RefObject } from "react";
import { api, mensaje } from "./api";
import type { Envio } from "./tipos";

export interface Carga<T> {
  datos: T | undefined;
  error: string | null;
  cargando: boolean;
  recargar: () => void;
  fijar: (valor: T | ((previo: T | undefined) => T)) => void;
}

/** Ejecuta una carga asíncrona cuando cambian las dependencias; ignora respuestas de cargas anteriores. */
export function useCarga<T>(fn: (senal: AbortSignal) => Promise<T>, deps: DependencyList): Carga<T> {
  const [datos, setDatos] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    setError(null);
    fn(control.signal)
      .then((d) => {
        if (!control.signal.aborted) setDatos(d);
      })
      .catch((e) => {
        if (!control.signal.aborted && (e as Error).name !== "AbortError") setError(mensaje(e));
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [...deps, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const fijar = useCallback((valor: T | ((previo: T | undefined) => T)) => {
    setDatos((previo) => (typeof valor === "function" ? (valor as (p: T | undefined) => T)(previo) : valor));
  }, []);
  return { datos, error, cargando, recargar, fijar };
}

export function useTitulo(titulo: string | undefined): void {
  useEffect(() => {
    document.title = titulo ? `${titulo} · LabPar` : "LabPar";
  }, [titulo]);
}

/** Ancho en píxeles de un elemento (para dibujar gráficas con texto de tamaño real). */
export function useAncho<T extends HTMLElement>(ref: RefObject<T | null>, inicial = 640): number {
  const [ancho, setAncho] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAncho(el.getBoundingClientRect().width || inicial);
    const obs = new ResizeObserver(([entrada]) => {
      const w = entrada.contentRect.width;
      if (w > 0) setAncho(w);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, inicial]);
  return ancho;
}

export function useIntervalo(fn: () => void, ms: number | null): void {
  const ultima = useRef(fn);
  ultima.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => ultima.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export function usePersistente<T>(clave: string, inicial: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado !== null ? (JSON.parse(guardado) as T) : inicial;
    } catch {
      return inicial;
    }
  });
  const fijar = useCallback(
    (v: T) => {
      setValor(v);
      try {
        localStorage.setItem(clave, JSON.stringify(v));
      } catch {
        /* sin almacenamiento local */
      }
    },
    [clave],
  );
  return [valor, fijar];
}

export function terminado(envio: Envio | null | undefined): boolean {
  return !!envio && (envio.estado === "completado" || envio.estado === "error");
}

/**
 * Sigue un envío hasta que termina. El sondeo empieza rápido y se espacia: las ejecuciones rápidas
 * suelen resolverse en uno o dos segundos y las evaluaciones completas en diez a veinte.
 */
export function useSeguimientoEnvio(inicial: Envio | null, alTerminar?: (e: Envio) => void): Envio | null {
  const [envio, setEnvio] = useState<Envio | null>(inicial);
  const callback = useRef(alTerminar);
  callback.current = alTerminar;

  useEffect(() => {
    setEnvio(inicial);
  }, [inicial]);

  const id = envio?.id;
  const enCurso = !!envio && !terminado(envio);
  useEffect(() => {
    if (!id || !enCurso) return;
    let vigente = true;
    let espera = 700;
    let temporizador: number;
    const consultar = async () => {
      try {
        const nuevo = await api<Envio>(`/envios/${id}`);
        if (!vigente) return;
        setEnvio(nuevo);
        if (terminado(nuevo)) {
          callback.current?.(nuevo);
          return;
        }
      } catch {
        /* reintenta en el siguiente ciclo */
      }
      espera = Math.min(espera * 1.35, 3000);
      temporizador = window.setTimeout(consultar, espera);
    };
    temporizador = window.setTimeout(consultar, espera);
    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [id, enCurso]);

  return envio;
}

/** Arrastre para redimensionar paneles; devuelve el valor (fracción 0–1) y el manejador del divisor. */
export function useDivisor(
  clave: string,
  inicial: number,
  eje: "x" | "y",
  minimo = 0.2,
  maximo = 0.8,
): [number, (e: EventoPuntero<HTMLElement>) => void, (delta: number) => void] {
  const [fraccion, setFraccion] = usePersistente(clave, inicial);
  const ajustar = useCallback(
    (delta: number) => setFraccion(Math.min(maximo, Math.max(minimo, fraccion + delta))),
    [fraccion, maximo, minimo, setFraccion],
  );
  const iniciar = useCallback(
    (e: EventoPuntero<HTMLElement>) => {
      const divisor = e.currentTarget;
      const contenedor = divisor.parentElement;
      if (!contenedor) return;
      e.preventDefault();
      divisor.setPointerCapture(e.pointerId);
      const caja = contenedor.getBoundingClientRect();
      const mover = (ev: PointerEvent) => {
        const f = eje === "x" ? (ev.clientX - caja.left) / caja.width : (ev.clientY - caja.top) / caja.height;
        setFraccion(Math.min(maximo, Math.max(minimo, f)));
      };
      const soltar = () => {
        divisor.removeEventListener("pointermove", mover);
        divisor.removeEventListener("pointerup", soltar);
        divisor.removeEventListener("pointercancel", soltar);
        document.body.classList.remove("arrastrando");
      };
      document.body.classList.add("arrastrando");
      divisor.addEventListener("pointermove", mover);
      divisor.addEventListener("pointerup", soltar);
      divisor.addEventListener("pointercancel", soltar);
    },
    [eje, maximo, minimo, setFraccion],
  );
  return [fraccion, iniciar, ajustar];
}
