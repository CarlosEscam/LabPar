// Íconos de trazo (24 × 24) dibujados para LabPar. Siempre acompañan a un texto o llevan una etiqueta accesible.

const TRAZOS: Record<string, string> = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  cruz: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  reloj: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  alerta: "M12 3.5l9 16H3l9-16zM12 10v4.2M12 17.2v.3",
  exclamacion: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5.5M12 16.2v.3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.7v.3",
  bombilla: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z",
  trofeo: "M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8.5 20.5h7M10 17h4",
  izquierda: "M15 5l-7 7 7 7",
  derecha: "M9 5l7 7-7 7",
  abajo: "M5 9l7 7 7-7",
  mas: "M12 5v14M5 12h14",
  descargar: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  subir: "M12 20V9M7 13.5l5-5 5 5M5 4h14",
  copiar: "M9 9h10v11H9zM5 15V4h10",
  sol: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  luna: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
  salir: "M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16.5L5.5 12 10 7.5M5.5 12H15",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  ejecutar: "M7 4.5v15l12-7.5-12-7.5z",
  enviar: "M4 12l16-8-6 16-3-6.5L4 12zM11 13.5l9-9.5",
  editar: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  basura: "M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6",
  ojo: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  actualizar: "M19.5 8.5A8 8 0 0 0 5 7M4.5 15.5A8 8 0 0 0 19 17M19.5 4v4.5H15M4.5 20v-4.5H9",
  duplicar: "M8 8h11v12H8zM16 8V4H5v12h3",
  libro: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5",
  grafica: "M4 20V4M4 20h16M8 16l3.5-4.5 3 2.5L20 7",
  servidor: "M4 4.5h16v6H4zM4 13.5h16v6H4zM7.5 7.5h.01M7.5 16.5h.01",
  candado: "M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  restaurar: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4.5H9",
  cerrar: "M6 6l12 12M18 6L6 18",
  enlace: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  encuesta: "M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01",
  personas: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6",
  filtro: "M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z",
  buscar: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15.5 15.5l5 5",
  terminal: "M4 4.5h16v15H4zM7.5 9l3 3-3 3M12.5 15h4",
};

export type NombreIcono = keyof typeof TRAZOS;

interface Props {
  nombre: NombreIcono;
  tamano?: number;
  grosor?: number;
  etiqueta?: string;
  className?: string;
}

export function Icono({ nombre, tamano = 18, grosor = 2, etiqueta, className }: Props) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={etiqueta ? "img" : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      focusable="false"
    >
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
