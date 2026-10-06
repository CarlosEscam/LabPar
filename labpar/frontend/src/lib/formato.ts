// Formatos y etiquetas en español (Colombia): coma decimal, fechas locales y nombres de veredictos.
import type { Modelo, Nivel, NivelRetro, VeredictoCaso } from "./tipos";

const LOCAL = "es-CO";

export function numero(valor: number | null | undefined, decimales = 2): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return new Intl.NumberFormat(LOCAL, { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
}

export function entero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat(LOCAL, { maximumFractionDigits: 0 }).format(valor);
}

export function puntaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return Number.isInteger(valor) ? String(valor) : numero(valor, 1);
}

export function porcentaje(valor: number | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined) return "—";
  return `${numero(valor * 100, decimales)} %`;
}

/** Segundos con una precisión que se adapta a la magnitud (ms para tiempos cortos). */
export function segundos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  if (valor < 0.01) return `${numero(valor * 1000, 2)} ms`;
  if (valor < 1) return `${numero(valor * 1000, 0)} ms`;
  if (valor < 60) return `${numero(valor, 2)} s`;
  const m = Math.floor(valor / 60);
  return `${m} min ${Math.round(valor - m * 60)} s`;
}

export function fecha(iso: string | null | undefined, conHora = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(LOCAL, conHora ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(d);
}

export function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat(LOCAL, { day: "numeric", month: "short" }).format(new Date(iso));
}

const RELATIVO = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function haceCuanto(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return "nunca";
  const s = (new Date(iso).getTime() - ahora) / 1000;
  const abs = Math.abs(s);
  if (abs < 45) return s <= 0 ? "hace un momento" : "en un momento";
  if (abs < 3600) return RELATIVO.format(Math.round(s / 60), "minute");
  if (abs < 86400) return RELATIVO.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return RELATIVO.format(Math.round(s / 86400), "day");
  return fecha(iso, false);
}

/** Valor para un <input type="datetime-local"> a partir de una fecha ISO (en hora local). */
export function aEntradaFecha(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function deEntradaFecha(valor: string): string | null {
  return valor ? new Date(valor).toISOString() : null;
}

export const NOMBRE_MODELO: Record<Modelo, string> = { openmp: "OpenMP", mpi: "MPI", cuda: "CUDA" };
export const NOMBRE_NIVEL: Record<Nivel, string> = { basico: "Básico", intermedio: "Intermedio", avanzado: "Avanzado" };

/** Cómo se llaman las unidades de ejecución en cada modelo. */
export function unidad(modelo: Modelo, n: number): string {
  if (modelo === "mpi") return n === 1 ? "proceso" : "procesos";
  if (modelo === "cuda") return n === 1 ? "hilo de GPU" : "hilos de GPU";
  return n === 1 ? "hilo" : "hilos";
}

export const ARCHIVO_FUENTE: Record<string, string> = { c: "programa.c", cpp: "programa.cpp", cuda: "programa.cu" };

export type TonoVeredicto = "ok" | "error" | "aviso" | "neutro" | "proceso";

export const VEREDICTOS: Record<string, { etiqueta: string; tono: TonoVeredicto }> = {
  aceptado: { etiqueta: "Aceptado", tono: "ok" },
  respuesta_incorrecta: { etiqueta: "Respuesta incorrecta", tono: "error" },
  error_compilacion: { etiqueta: "Error de compilación", tono: "error" },
  error_ejecucion: { etiqueta: "Error de ejecución", tono: "error" },
  tiempo_excedido: { etiqueta: "Tiempo excedido", tono: "aviso" },
  requisitos_incumplidos: { etiqueta: "Requisitos incumplidos", tono: "aviso" },
  no_disponible: { etiqueta: "Modelo no disponible", tono: "neutro" },
  error_interno: { etiqueta: "Error interno", tono: "neutro" },
  ejecutado: { etiqueta: "Ejecutado", tono: "ok" },
  completado: { etiqueta: "Completado", tono: "ok" },
  pendiente: { etiqueta: "En cola", tono: "proceso" },
  ejecutando: { etiqueta: "Evaluando", tono: "proceso" },
  error: { etiqueta: "Falló el proceso", tono: "neutro" },
};

export function veredicto(clave: string | null | undefined): { etiqueta: string; tono: TonoVeredicto } {
  if (!clave) return { etiqueta: "Sin resultado", tono: "neutro" };
  return VEREDICTOS[clave] ?? { etiqueta: clave.replaceAll("_", " "), tono: "neutro" };
}

export const VEREDICTO_CASO: Record<VeredictoCaso, { etiqueta: string; corta: string }> = {
  AC: { etiqueta: "Correcto", corta: "Correcto" },
  WA: { etiqueta: "Salida incorrecta", corta: "Incorrecto" },
  TLE: { etiqueta: "Tiempo límite excedido", corta: "Tiempo" },
  RE: { etiqueta: "Error en ejecución", corta: "Error" },
  OMITIDO: { etiqueta: "No ejecutado", corta: "Omitido" },
};

export const NIVEL_RETRO: Record<NivelRetro, string> = {
  error: "Error",
  advertencia: "Advertencia",
  sugerencia: "Sugerencia",
  logro: "Logro",
  info: "Información",
};

export function plural(n: number, singular: string, pluralForma?: string): string {
  return `${entero(n)} ${n === 1 ? singular : (pluralForma ?? singular + "s")}`;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
