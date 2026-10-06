import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, las llamadas a /api se redirigen al backend FastAPI (uvicorn en el puerto 8000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.LABPAR_API ?? "http://127.0.0.1:8000" },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // El editor y el renderizador de Markdown/KaTeX van en fragmentos propios: solo se descargan al abrir
        // un laboratorio, el editor o el simulador, y quedan en caché entre esas páginas.
        codeSplitting: {
          groups: [
            // React va en su propio fragmento con mayor prioridad: si no, el grupo de Markdown lo arrastraría consigo
            // y la página de ingreso tendría que descargar todo el renderizador.
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler|cookie|set-cookie-parser)[\\/]/, priority: 20 },
            { name: "editor", priority: 10, test: /node_modules[\\/](@codemirror|@lezer|codemirror|crelt|style-mod|w3c-keyname|@marijn)/ },
            {
              name: "markdown",
              priority: 10,
              test: /node_modules[\\/](katex|react-markdown|remark-|rehype-|micromark|mdast-|hast-|unist-|unified|vfile)/,
            },
          ],
        },
      },
    },
  },
});
