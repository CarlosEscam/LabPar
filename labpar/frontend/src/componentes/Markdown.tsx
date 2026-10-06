import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Enunciados en Markdown con tablas (GFM) y fórmulas LaTeX ($…$ y $$…$$) renderizadas con KaTeX.
// No se permite HTML crudo: el contenido lo escriben docentes, pero se muestra a todos los estudiantes.

/** remark-math solo trata como bloque las fórmulas con $$ en líneas propias; se normalizan las de una línea. */
function normalizar(texto: string): string {
  return texto.replace(/^[ \t]*\$\$([^\n$]+?)\$\$[ \t]*$/gm, (_, formula: string) => `$$\n${formula.trim()}\n$$`);
}

export function Markdown({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={`prosa ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="prosa-tabla">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {normalizar(texto)}
      </ReactMarkdown>
    </div>
  );
}
