// Tipos de la API de LabPar (espejo de labpar/esquemas.py y del resultado del motor de evaluación).

export type Rol = "estudiante" | "docente" | "admin";
export type Modelo = "openmp" | "mpi" | "cuda";
export type Lenguaje = "c" | "cpp" | "cuda";
export type Nivel = "basico" | "intermedio" | "avanzado";

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  consentimiento_investigacion: boolean;
  creado_en: string;
  ultimo_ingreso: string | null;
}

export interface TokenOut {
  token: string;
  usuario: Usuario;
}

export interface ConfigPublica {
  registro_abierto: boolean;
  demo: boolean;
  cuentas_demo: { rol: string; email: string; clave: string }[];
  version: string;
  institucion: string;
  contacto_datos: string;
}

export interface Curso {
  id: number;
  nombre: string;
  periodo: string;
  descripcion: string;
  docente_id: number;
  docente_nombre: string;
  codigo_inscripcion: string | null;
  encuesta_sus_activa: boolean;
  activo: boolean;
  num_estudiantes: number;
  num_asignaciones: number;
  creado_en: string;
}

export interface EstudianteCurso {
  id: number;
  nombre: string;
  email: string;
  inscrito_en: string;
  envios: number;
  aceptados: number;
  ultimo_envio: string | null;
}

export interface LabResumen {
  id: number;
  slug: string;
  titulo: string;
  modelo: Modelo;
  lenguaje: Lenguaje;
  nivel: Nivel;
  orden: number;
  resumen: string;
  conceptos: string[];
  duracion_estimada_min: number;
  publicado: boolean;
  del_banco: boolean;
  version: number;
  autor_id: number | null;
}

export interface Objetivo {
  nivel?: string;
  texto: string;
}

export interface Pregunta {
  pregunta: string;
  opciones: string[];
  correcta: number;
  explicacion?: string;
}

export interface EvaluacionPublica {
  hilos_correccion: number[];
  repeticiones_correccion: number;
  hilos_rendimiento: number[];
  repeticiones_rendimiento: number;
  tiempo_limite_s: number;
  comparacion: "exacta" | "tokens" | "numerica";
  tolerancia_rel: number;
  peso_correccion: number;
  peso_rendimiento: number;
  eficiencia_objetivo: number | null;
  aceleracion_objetivo: number | null;
  mide_rendimiento: boolean;
  requisitos: string[];
  prohibidos: string[];
  num_casos: number;
  num_casos_ocultos: number;
}

export interface CasoVisible {
  id: number;
  nombre: string;
  entrada: string;
  salida_esperada: string;
}

export interface Caso extends CasoVisible {
  visible: boolean;
  peso: number;
  orden: number;
}

export interface LabEstudiante extends LabResumen {
  enunciado_md: string;
  plantilla: string;
  objetivos: (Objetivo | string)[];
  preguntas: Pregunta[];
  pistas: string[];
  evaluacion: EvaluacionPublica;
  casos_visibles: CasoVisible[];
}

export interface LabDocente extends LabEstudiante {
  solucion_referencia: string;
  solucion_docente: string;
  config: Record<string, unknown>;
  casos: Caso[];
  actualizado_en: string;
  puede_editar: boolean;
}

export type Laboratorio = LabEstudiante | LabDocente;

export function esLabDocente(lab: Laboratorio): lab is LabDocente {
  return "solucion_docente" in lab;
}

export interface Asignacion {
  id: number;
  curso_id: number;
  laboratorio: LabResumen;
  fecha_limite: string | null;
  intentos_max: number | null;
  creado_en: string;
  estado: "sin_intentos" | "en_progreso" | "aceptado" | null;
  intentos: number | null;
  mejor_puntaje: number | null;
  estudiantes_con_intentos: number | null;
  estudiantes_aceptados: number | null;
}

export type EstadoEnvio = "pendiente" | "ejecutando" | "completado" | "error";
export type TipoEnvio = "evaluacion" | "ejecucion" | "referencia";

export interface EnvioResumen {
  id: number;
  usuario_id: number;
  laboratorio_id: number;
  curso_id: number | null;
  tipo: TipoEnvio;
  estado: EstadoEnvio;
  veredicto: string | null;
  puntaje: number | null;
  correcto: boolean;
  aceleracion: number | null;
  eficiencia: number | null;
  creado_en: string;
  iniciado_en: string | null;
  finalizado_en: string | null;
  parametros: Record<string, unknown>;
}

export interface Envio extends EnvioResumen {
  resultado: Resultado | null;
  posicion_cola: number | null;
  usuario_nombre: string | null;
  laboratorio_titulo: string | null;
}

// ----------------------------------------------------------------------------- Resultado del motor
export type NivelRetro = "error" | "advertencia" | "sugerencia" | "logro" | "info";

export interface Retro {
  nivel: NivelRetro;
  codigo: string;
  mensaje: string;
  titulo: string;
  linea: number | null;
}

export interface Diagnostico {
  linea: number | null;
  columna: number | null;
  tipo: "error" | "advertencia";
  mensaje: string;
  explicacion: string | null;
}

export interface Compilacion {
  ok: boolean;
  comando: string;
  salida: string;
  diagnosticos: Diagnostico[];
  tiempo_s: number;
}

export type VeredictoCaso = "AC" | "WA" | "TLE" | "RE" | "OMITIDO";

export interface EjecucionCaso {
  p: number;
  rep: number;
  veredicto: VeredictoCaso;
  tiempo_s: number | null;
  senal?: number | null;
  codigo_salida?: number | null;
}

export interface ComparacionDetalle {
  ok: boolean;
  linea?: number | null;
  esperado?: string | null;
  obtenido?: string | null;
  detalle?: string | null;
}

export interface CasoResultado {
  id: number | null;
  nombre: string;
  visible: boolean;
  peso: number;
  aprobado: boolean;
  veredicto: VeredictoCaso;
  ejecuciones: EjecucionCaso[];
  detalle: {
    p: number;
    rep: number;
    veredicto: VeredictoCaso;
    comparacion: ComparacionDetalle | null;
    stdout: string | null;
    stderr: string | null;
  } | null;
  salidas_distintas: Record<string, boolean>;
  entrada: string | null;
  esperada: string | null;
}

export interface PuntoRendimiento {
  p: number;
  tiempo_s: number;
  aceleracion: number;
  eficiencia: number | null;
  aceleracion_relativa: number | null;
  karp_flatt: number | null;
}

export interface Rendimiento {
  medido: boolean;
  evaluable: boolean;
  incorrecto?: boolean;
  motivo?: string;
  nucleos?: number;
  fuente_tiempo?: "interno" | "externo";
  repeticiones?: number;
  t_referencia_s?: number;
  puntos?: PuntoRendimiento[];
  p_max?: number;
  aceleracion_max?: number;
  eficiencia_pmax?: number | null;
  objetivo_aceleracion?: number;
  eficiencia_objetivo?: number | null;
  fraccion_objetivo?: number;
  // Ejecución de referencia (generar salidas): tiempo de la versión secuencial con la entrada de rendimiento
  ok?: boolean;
  tiempo_s?: number;
  tiempo_interno_s?: number | null;
  salida?: string;
}

export interface Puntaje {
  correccion: number;
  rendimiento: number;
  total: number;
  peso_correccion: number;
  peso_rendimiento: number;
  rendimiento_evaluable: boolean;
  nota: string | null;
}

export interface Requisito {
  tipo?: string;
  mensaje: string;
  cumplido: boolean;
  linea?: number | null;
}

export interface Resultado {
  tipo: TipoEnvio;
  veredicto: string;
  modelo?: Modelo;
  requisitos?: Requisito[];
  compilacion?: Compilacion;
  correccion?: { casos: CasoResultado[]; proporcion: number };
  rendimiento?: Rendimiento | null;
  puntaje?: Puntaje | null;
  retroalimentacion?: Retro[];
  duracion_s?: number;
  nodo?: string;
  // Ejecución rápida
  p?: number;
  entrada?: string;
  stdout?: string;
  stderr?: string;
  tiempo_s?: number;
  tiempo_interno_s?: number | null;
  codigo_salida?: number | null;
  senal?: number | null;
  comparacion_ejemplo?: ComparacionDetalle & { caso: string };
  // Referencia
  casos?: { id: number; nombre: string; ok: boolean; salida: string; error: string | null; tiempo_s: number }[];
}

// ----------------------------------------------------------------------------- Analítica
export interface CeldaProgreso {
  usuario_id: number;
  laboratorio_id: number;
  intentos: number;
  mejor_puntaje: number | null;
  aceptado: boolean;
  envios_hasta_aceptado: number | null;
  minutos_hasta_aceptado: number | null;
  mejor_aceleracion: number | null;
  primera_apertura: string | null;
}

export interface Progreso {
  estudiantes: { id: number; nombre: string; email: string }[];
  laboratorios: LabResumen[];
  celdas: CeldaProgreso[];
}

export interface ResumenEstadistico {
  n: number;
  media: number | null;
  de: number | null;
  mediana: number | null;
  minimo: number | null;
  maximo: number | null;
  ic95: [number, number] | null;
}

export interface PruebaT {
  t: number | null;
  gl: number;
  p: number | null;
  mu0: number;
  alternativa: string;
  d?: number;
  significativa?: boolean;
  nota?: string;
}

export interface Analitica {
  resumen: {
    estudiantes: number;
    laboratorios: number;
    evaluaciones: number;
    ejecuciones: number;
    estudiantes_activos: number;
    pares_aceptados: number;
    pares_totales: number;
    consentimientos: number;
  };
  envios_por_dia: { fecha: string; evaluaciones: number; ejecuciones: number }[];
  veredictos: { veredicto: string; n: number }[];
  retro_frecuente: { codigo: string; titulo: string; n: number; estudiantes: number }[];
  por_laboratorio: {
    laboratorio: LabResumen;
    estudiantes_con_intentos: number;
    aceptados: number;
    intentos: number;
    puntaje_medio: number | null;
    mediana_aceleracion: number | null;
    mediana_minutos_hasta_aceptado: number | null;
    mediana_envios_hasta_aceptado: number | null;
  }[];
  distribucion_puntajes: number[];
  sus: {
    activa: boolean;
    resumen: ResumenEstadistico;
    prueba_t: PruebaT | null;
    histograma: number[];
    mu0: number;
  };
}

export interface EstadoSUS {
  activa: boolean;
  respondida: boolean;
  puntaje: number | null;
}

export interface TrabajadorEstado {
  id: string;
  host: string;
  pid: number;
  estado: "libre" | "ocupado" | "detenido" | "sin_respuesta";
  envio_actual: number | null;
  procesados: number;
  fallidos: number;
  capacidades: {
    nucleos?: number;
    openmp?: { disponible: boolean; detalle?: string };
    mpi?: { disponible: boolean; detalle?: string };
    cuda?: { disponible: boolean; detalle?: string };
  };
  segundos_desde_latido: number;
  iniciado_en: string;
}

export interface EstadoSistema {
  version: string;
  trabajadores: TrabajadorEstado[];
  capacidades: Record<Modelo, boolean>;
  nucleos_totales: number;
  nodos: number;
  cola: {
    pendientes: number;
    ejecutando: number;
    completados_24h: number;
    errores_24h: number;
    espera_media_s: number | null;
    proceso_medio_s: number | null;
  };
}

export interface Borrador {
  codigo: string | null;
  actualizado_en: string | null;
}
