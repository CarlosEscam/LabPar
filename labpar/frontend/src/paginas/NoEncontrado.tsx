import { Link } from "react-router";
import { useTitulo } from "../lib/ganchos";

export default function NoEncontrado() {
  useTitulo("Página no encontrada");
  return (
    <div className="contenedor pagina">
      <div className="pila" style={{ maxWidth: 560 }}>
        <h1>Esta página no existe</h1>
        <p className="descripcion">
          Puede que el enlace esté incompleto o que no tengas permiso para ver este contenido con tu rol actual.
        </p>
        <div>
          <Link className="boton boton-primario" to="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
