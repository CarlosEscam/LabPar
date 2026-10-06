import { api } from "./api";

// Registro de eventos de uso para la analítica de aprendizaje (se envían sin bloquear la interfaz).
export type TipoEvento = "lab_abierto" | "pista_vista" | "cuestionario_respondido" | "simulador_usado" | "enunciado_leido";

export function registrarEvento(
  tipo: TipoEvento,
  { laboratorio_id, curso_id, datos }: { laboratorio_id?: number; curso_id?: number; datos?: Record<string, unknown> } = {},
): void {
  void api("/eventos", { metodo: "POST", cuerpo: { tipo, laboratorio_id, curso_id, datos: datos ?? {} } }).catch(() => {
    /* la analítica nunca debe interrumpir el trabajo del estudiante */
  });
}
