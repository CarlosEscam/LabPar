import { indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { Decoration, EditorView, keymap, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

// Editor de código (CodeMirror 6). Las construcciones paralelas se resaltan con el color de su modelo:
// directivas y funciones de OpenMP en azul, llamadas MPI_* en naranja y extensiones de CUDA en violeta.

export interface DiagnosticoEditor {
  linea: number;
  mensaje: string;
  severidad: "error" | "warning" | "info";
}

interface Props {
  valor: string;
  alCambiar?: (valor: string) => void;
  soloLectura?: boolean;
  diagnosticos?: DiagnosticoEditor[];
  /** Cambia el objeto para desplazar el cursor a una línea (por ejemplo, al pulsar un error). */
  irA?: { linea: number } | null;
  etiqueta: string;
  className?: string;
}

const tema = EditorView.theme({
  "&": { height: "100%", fontSize: "14.5px", backgroundColor: "var(--editor-fondo)", color: "var(--tinta)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--fuente-codigo)", lineHeight: "1.62", overflow: "auto" },
  ".cm-content": { caretColor: "var(--tinta)", padding: "10px 0 40px" },
  ".cm-gutters": {
    backgroundColor: "var(--editor-fondo)",
    color: "var(--tenue)",
    border: "none",
    borderRight: "1px solid var(--linea)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px", fontVariantNumeric: "tabular-nums" },
  ".cm-activeLine": { backgroundColor: "var(--editor-activa)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--editor-activa)", color: "var(--grafito)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--seleccion) !important",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--tinta)", borderLeftWidth: "2px" },
  ".cm-matchingBracket": { backgroundColor: "var(--hoja-3)", outline: "1px solid var(--linea-fuerte)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--hoja-3)", border: "none", color: "var(--grafito)" },
  ".cm-tooltip": {
    backgroundColor: "var(--hoja)",
    border: "1px solid var(--linea)",
    borderRadius: "8px",
    color: "var(--tinta)",
    boxShadow: "0 10px 28px rgba(10,20,24,.18)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--seleccion)", color: "var(--tinta)" },
  ".cm-diagnostic": { fontFamily: "var(--fuente)", fontSize: "14px", padding: "6px 10px", maxWidth: "520px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--error)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--aviso)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--error)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--aviso)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
  ".cm-panels": { backgroundColor: "var(--hoja-2)", color: "var(--tinta)" },
  ".cm-searchMatch": { backgroundColor: "var(--aviso-suave)", outline: "1px solid var(--aviso)" },
  ".cm-paralelo-omp, .cm-paralelo-omp *": { color: "var(--omp-texto)", fontWeight: "650" },
  ".cm-paralelo-mpi, .cm-paralelo-mpi *": { color: "var(--mpi-texto)", fontWeight: "650" },
  ".cm-paralelo-cuda, .cm-paralelo-cuda *": { color: "var(--cuda-texto)", fontWeight: "650" },
  ".cm-linea-pragma": { backgroundColor: "var(--editor-pragma)" },
});

const resaltado = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier, t.definitionKeyword],
    color: "var(--sintaxis-clave)",
    fontWeight: "650",
  },
  { tag: [t.typeName, t.standard(t.typeName)], color: "var(--sintaxis-tipo)" },
  { tag: [t.string, t.character, t.special(t.string)], color: "var(--sintaxis-cadena)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--sintaxis-numero)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--sintaxis-comentario)", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.meta, t.macroName], color: "var(--sintaxis-pre)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--grafito)" },
]);

const PATRON_PARALELO =
  /#\s*pragma\s+omp\b[^\n]*|\bomp_[A-Za-z_]+\b|\bMPI_[A-Za-z_]+\b|\b__(?:global|device|host|shared|syncthreads|constant)__\b|<<<|>>>|\b(?:threadIdx|blockIdx|blockDim|gridDim|warpSize)\b|\bcuda[A-Z][A-Za-z]*\b|\batomicAdd\b|\b__syncthreads\b/g;

const decorador = new MatchDecorator({
  regexp: PATRON_PARALELO,
  decoration: (m) => {
    const texto = m[0];
    const clase =
      texto.startsWith("#") || texto.startsWith("omp_")
        ? "cm-paralelo-omp"
        : texto.startsWith("MPI_")
          ? "cm-paralelo-mpi"
          : "cm-paralelo-cuda";
    return Decoration.mark({ class: clase });
  },
});

const construccionesParalelas = ViewPlugin.fromClass(
  class {
    decoraciones: DecorationSet;
    constructor(vista: EditorView) {
      this.decoraciones = decorador.createDeco(vista);
    }
    update(u: ViewUpdate) {
      this.decoraciones = decorador.updateDeco(u, this.decoraciones);
    }
  },
  { decorations: (v) => v.decoraciones },
);

const lineaPragma = Decoration.line({ class: "cm-linea-pragma" });
const lineasPragma = ViewPlugin.fromClass(
  class {
    decoraciones: DecorationSet;
    constructor(vista: EditorView) {
      this.decoraciones = this.construir(vista);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decoraciones = this.construir(u.view);
    }
    construir(vista: EditorView) {
      const rangos: ReturnType<typeof lineaPragma.range>[] = [];
      for (const { from, to } of vista.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const linea = vista.state.doc.lineAt(pos);
          if (/^\s*#\s*pragma\s+omp\b/.test(linea.text)) rangos.push(lineaPragma.range(linea.from));
          pos = linea.to + 1;
        }
      }
      return Decoration.set(rangos);
    }
  },
  { decorations: (v) => v.decoraciones },
);

export function Editor({ valor, alCambiar, soloLectura = false, diagnosticos, irA, etiqueta, className }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const vista = useRef<EditorView | null>(null);
  const lectura = useRef(new Compartment());
  const cambio = useRef(alCambiar);
  cambio.current = alCambiar;

  useEffect(() => {
    if (!contenedor.current) return;
    const v = new EditorView({
      parent: contenedor.current,
      state: EditorState.create({
        doc: valor,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          cpp(),
          tema,
          syntaxHighlighting(resaltado),
          construccionesParalelas,
          lineasPragma,
          lintGutter(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(4),
          lectura.current.of([EditorState.readOnly.of(soloLectura), EditorView.editable.of(!soloLectura)]),
          EditorView.contentAttributes.of({ "aria-label": etiqueta }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cambio.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    vista.current = v;
    return () => {
      v.destroy();
      vista.current = null;
    };
    // El editor se crea una sola vez; los cambios de props se aplican en los efectos siguientes.
  }, []);

  // Contenido cargado desde fuera (plantilla, historial, solución): reemplaza el documento sin perder el editor.
  useEffect(() => {
    const v = vista.current;
    if (v && v.state.doc.toString() !== valor) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: valor } });
    }
  }, [valor]);

  useEffect(() => {
    vista.current?.dispatch({
      effects: lectura.current.reconfigure([EditorState.readOnly.of(soloLectura), EditorView.editable.of(!soloLectura)]),
    });
  }, [soloLectura]);

  useEffect(() => {
    const v = vista.current;
    if (!v) return;
    const lista: Diagnostic[] = [];
    for (const d of diagnosticos ?? []) {
      if (d.linea < 1 || d.linea > v.state.doc.lines) continue;
      const linea = v.state.doc.line(d.linea);
      const inicio = linea.from + (linea.text.length - linea.text.trimStart().length);
      lista.push({ from: inicio, to: Math.max(inicio, linea.to), severity: d.severidad, message: d.mensaje });
    }
    v.dispatch(setDiagnostics(v.state, lista));
  }, [diagnosticos]);

  useEffect(() => {
    const v = vista.current;
    if (!v || !irA) return;
    const n = Math.min(Math.max(1, irA.linea), v.state.doc.lines);
    const linea = v.state.doc.line(n);
    v.dispatch({ selection: { anchor: linea.from }, effects: EditorView.scrollIntoView(linea.from, { y: "center" }) });
    v.focus();
  }, [irA]);

  return <div ref={contenedor} className={`editor ${className ?? ""}`} />;
}
