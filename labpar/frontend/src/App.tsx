import { Component, lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { Marco } from "./componentes/Marco";
import { ProveedorNotificaciones } from "./componentes/Notificaciones";
import { Cargando } from "./componentes/UI";
import { esPersonal, ProveedorSesion, useSesion } from "./lib/sesion";
import Ingresar from "./paginas/Ingresar";
import Inicio from "./paginas/Inicio";
import NoEncontrado from "./paginas/NoEncontrado";

const Registro = lazy(() => import("./paginas/Registro"));
const Privacidad = lazy(() => import("./paginas/Privacidad"));
const Curso = lazy(() => import("./paginas/Curso"));
const EncuestaSUS = lazy(() => import("./paginas/EncuestaSUS"));
const EspacioLaboratorio = lazy(() => import("./paginas/EspacioLaboratorio"));
const Banco = lazy(() => import("./paginas/Banco"));
const EditorLaboratorio = lazy(() => import("./paginas/EditorLaboratorio"));
const DetalleEnvio = lazy(() => import("./paginas/DetalleEnvio"));
const Simulador = lazy(() => import("./paginas/Simulador"));
const Perfil = lazy(() => import("./paginas/Perfil"));
const Sistema = lazy(() => import("./paginas/Sistema"));

function Protegida({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return <PantallaCarga />;
  if (!usuario) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  return <>{children}</>;
}

function SoloInvitado({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useSesion();
  if (cargando) return <PantallaCarga />;
  if (usuario) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SoloPersonal({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  if (!esPersonal(usuario)) return <NoEncontrado />;
  return <>{children}</>;
}

function PantallaCarga() {
  return (
    <div className="contenedor">
      <Cargando />
    </div>
  );
}

class LimiteError extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className="contenedor pagina">
        <div className="pila" style={{ maxWidth: 620 }}>
          <h1>Algo salió mal en esta pantalla</h1>
          <p className="descripcion">
            {chunk
              ? "La plataforma se actualizó mientras la usabas. Recarga la página para obtener la versión nueva."
              : "Ocurrió un error inesperado al mostrar esta página. Recárgala; si el problema continúa, avisa al administrador."}
          </p>
          <pre className="consola">{this.state.error.message}</pre>
          <div>
            <button className="boton boton-primario" onClick={() => window.location.reload()}>
              Recargar la página
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function Raiz() {
  return (
    <Suspense fallback={<PantallaCarga />}>
      <Outlet />
    </Suspense>
  );
}

const enrutador = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Raiz />}>
      <Route
        path="/ingresar"
        element={
          <SoloInvitado>
            <Ingresar />
          </SoloInvitado>
        }
      />
      <Route
        path="/registro"
        element={
          <SoloInvitado>
            <Registro />
          </SoloInvitado>
        }
      />
      <Route path="/privacidad" element={<Privacidad />} />
      <Route
        element={
          <Protegida>
            <Marco />
          </Protegida>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="cursos/:cursoId" element={<Curso />} />
        <Route path="cursos/:cursoId/encuesta" element={<EncuestaSUS />} />
        <Route path="cursos/:cursoId/laboratorios/:labId" element={<EspacioLaboratorio />} />
        <Route
          path="laboratorios"
          element={
            <SoloPersonal>
              <Banco />
            </SoloPersonal>
          }
        />
        <Route
          path="laboratorios/nuevo"
          element={
            <SoloPersonal>
              <EditorLaboratorio />
            </SoloPersonal>
          }
        />
        <Route
          path="laboratorios/:labId"
          element={
            <SoloPersonal>
              <EspacioLaboratorio />
            </SoloPersonal>
          }
        />
        <Route
          path="laboratorios/:labId/editar"
          element={
            <SoloPersonal>
              <EditorLaboratorio />
            </SoloPersonal>
          }
        />
        <Route path="envios/:envioId" element={<DetalleEnvio />} />
        <Route path="simulador" element={<Simulador />} />
        <Route path="perfil" element={<Perfil />} />
        <Route
          path="sistema"
          element={
            <SoloPersonal>
              <Sistema />
            </SoloPersonal>
          }
        />
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Route>,
  ),
);

export default function App() {
  return (
    <LimiteError>
      <ProveedorSesion>
        <ProveedorNotificaciones>
          <RouterProvider router={enrutador} />
        </ProveedorNotificaciones>
      </ProveedorSesion>
    </LimiteError>
  );
}
