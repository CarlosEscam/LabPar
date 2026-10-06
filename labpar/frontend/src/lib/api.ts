// Cliente HTTP de la API. El token JWT se guarda en localStorage y se envía como encabezado Bearer.

const BASE = "/api";
const CLAVE_TOKEN = "labpar.token";

let token: string | null = leerToken();
let alExpirarSesion: (() => void) | null = null;

function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function fijarToken(nuevo: string | null): void {
  token = nuevo;
  try {
    if (nuevo) localStorage.setItem(CLAVE_TOKEN, nuevo);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* almacenamiento no disponible: la sesión dura lo que dure la pestaña */
  }
}

export function hayToken(): boolean {
  return token !== null;
}

export function alExpirar(fn: (() => void) | null): void {
  alExpirarSesion = fn;
}

export class ErrorApi extends Error {
  estado: number;
  constructor(mensaje: string, estado: number) {
    super(mensaje);
    this.estado = estado;
  }
}

const CAMPOS: Record<string, string> = {
  nombre: "Nombre",
  email: "Correo",
  clave: "Contraseña",
  clave_nueva: "Nueva contraseña",
  codigo: "Código",
  codigo_inscripcion: "Código del curso",
  titulo: "Título",
  slug: "Identificador",
  periodo: "Periodo",
  entrada: "Entrada",
  salida_esperada: "Salida esperada",
  peso: "Peso",
  intentos_max: "Intentos máximos",
  duracion_estimada_min: "Duración estimada",
  respuestas: "Respuestas",
};

interface ErrorValidacion {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  ctx?: Record<string, unknown>;
}

function traducirValidacion(e: ErrorValidacion): string {
  const campo = [...(e.loc ?? [])].reverse().find((x) => typeof x === "string" && x !== "body") as string | undefined;
  const etiqueta = campo ? (CAMPOS[campo] ?? campo) : "Un dato";
  const ctx = e.ctx ?? {};
  switch (e.type) {
    case "missing":
      return `${etiqueta}: es obligatorio.`;
    case "string_too_short":
      return `${etiqueta}: debe tener al menos ${ctx.min_length} caracteres.`;
    case "string_too_long":
      return `${etiqueta}: admite como máximo ${ctx.max_length} caracteres.`;
    case "too_short":
      return `${etiqueta}: faltan elementos.`;
    case "greater_than_equal":
    case "greater_than":
      return `${etiqueta}: el valor es demasiado pequeño.`;
    case "less_than_equal":
    case "less_than":
      return `${etiqueta}: el valor es demasiado grande.`;
    case "string_pattern_mismatch":
      return `${etiqueta}: el formato no es válido.`;
    case "int_parsing":
    case "float_parsing":
      return `${etiqueta}: debe ser un número.`;
    case "value_error":
      return (e.msg ?? "").replace(/^Value error,\s*/, "");
    default:
      return `${etiqueta}: ${(e.msg ?? "valor no válido").replace(/^Value error,\s*/, "")}`;
  }
}

function mensajeDeError(cuerpo: unknown, estado: number): string {
  if (cuerpo && typeof cuerpo === "object" && "detail" in cuerpo) {
    const detalle = (cuerpo as { detail: unknown }).detail;
    if (typeof detalle === "string") return detalle;
    if (Array.isArray(detalle)) return detalle.map((d) => traducirValidacion(d as ErrorValidacion)).join(" ");
  }
  if (estado === 413) return "El contenido enviado es demasiado grande.";
  if (estado >= 500) return "El servidor tuvo un problema al atender la solicitud. Intenta de nuevo en un momento.";
  return `La solicitud falló (código ${estado}).`;
}

interface Opciones {
  metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  cuerpo?: unknown;
  senal?: AbortSignal;
}

export async function api<T>(ruta: string, { metodo = "GET", cuerpo, senal }: Opciones = {}): Promise<T> {
  const encabezados: Record<string, string> = { Accept: "application/json" };
  if (token) encabezados.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) encabezados["Content-Type"] = "application/json";
  let respuesta: Response;
  try {
    respuesta = await fetch(BASE + ruta, {
      method: metodo,
      headers: encabezados,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: senal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ErrorApi("No hay conexión con el servidor de LabPar. Verifica tu red o que el servicio esté en marcha.", 0);
  }
  if (respuesta.status === 204) return undefined as T;
  const tipo = respuesta.headers.get("content-type") ?? "";
  const datos: unknown = tipo.includes("application/json") ? await respuesta.json() : await respuesta.text();
  if (!respuesta.ok) {
    if (respuesta.status === 401 && token) alExpirarSesion?.();
    throw new ErrorApi(mensajeDeError(datos, respuesta.status), respuesta.status);
  }
  return datos as T;
}

/** Descarga un archivo protegido (por ejemplo, un CSV) y lo guarda con el nombre indicado. */
export async function descargar(ruta: string, nombre: string): Promise<void> {
  const respuesta = await fetch(BASE + ruta, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!respuesta.ok) {
    let cuerpo: unknown = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ErrorApi(mensajeDeError(cuerpo, respuesta.status), respuesta.status);
  }
  guardarBlob(await respuesta.blob(), nombre);
}

export function guardarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mensaje(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
