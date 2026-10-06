// Escala de usabilidad del sistema (SUS; Brooke, 1996), adaptada al español.
// Los ítems impares están redactados en positivo y los pares en negativo: el puntaje (0–100) se calcula en el servidor.

export const ITEMS_SUS = [
  "Creo que me gustaría usar esta plataforma con frecuencia.",
  "Encontré la plataforma innecesariamente compleja.",
  "Pensé que la plataforma era fácil de usar.",
  "Creo que necesitaría el apoyo de una persona experta para poder usar esta plataforma.",
  "Encontré que las distintas funciones de la plataforma estaban bien integradas.",
  "Pensé que había demasiada inconsistencia en la plataforma.",
  "Imagino que la mayoría de las personas aprendería a usar esta plataforma muy rápidamente.",
  "Encontré la plataforma muy engorrosa de usar.",
  "Me sentí muy seguro o segura al usar la plataforma.",
  "Necesité aprender muchas cosas antes de poder empezar a usar esta plataforma.",
] as const;

export const ESCALA_SUS = [
  { valor: 1, texto: "Totalmente en desacuerdo" },
  { valor: 2, texto: "En desacuerdo" },
  { valor: 3, texto: "Ni de acuerdo ni en desacuerdo" },
  { valor: 4, texto: "De acuerdo" },
  { valor: 5, texto: "Totalmente de acuerdo" },
] as const;

/** Rangos de aceptabilidad de Bangor, Kortum y Miller (2008). */
export function aceptabilidad(puntaje: number): { texto: string; tono: "error" | "aviso" | "ok" } {
  if (puntaje < 50) return { texto: "No aceptable", tono: "error" };
  if (puntaje < 70) return { texto: "Marginal", tono: "aviso" };
  return { texto: "Aceptable", tono: "ok" };
}
