import { Link, useNavigate } from "react-router";
import { Icono } from "../componentes/Icono";
import { Logotipo } from "../componentes/Marca";
import { api } from "../lib/api";
import { useCarga, useTitulo } from "../lib/ganchos";
import type { ConfigPublica } from "../lib/tipos";

export default function Privacidad() {
  useTitulo("Tratamiento de datos personales");
  const navegar = useNavigate();
  const config = useCarga((senal) => api<ConfigPublica>("/auth/config-publica", { senal }), []);
  const institucion = config.datos?.institucion || "la Universidad";
  const contacto = config.datos?.contacto_datos;

  return (
    <div className="documento-legal">
      <header className="barra barra-simple">
        <Link to="/" className="barra-marca" aria-label="LabPar, inicio">
          <Logotipo />
        </Link>
        <button className="boton boton-sutil" onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/"))}>
          <Icono nombre="izquierda" /> Volver
        </button>
      </header>
      <main className="contenedor pagina prosa" id="contenido">
        <h1>Tratamiento de datos personales</h1>
        <p className="descripcion">
          Cómo usa LabPar la información de estudiantes y docentes, de acuerdo con la Ley 1581 de 2012 y el Decreto 1377 de 2013.
        </p>

        <h2>Responsable</h2>
        <p>
          El responsable del tratamiento es {institucion}, que opera LabPar en sus propios servidores como apoyo a los cursos de
          programación paralela y como instrumento del proyecto de investigación asociado.
          {contacto ? (
            <>
              {" "}
              Para consultas y reclamos escribe a <a href={`mailto:${contacto}`}>{contacto}</a>.
            </>
          ) : (
            " Para consultas y reclamos dirígete al docente de tu curso o al administrador de la plataforma."
          )}
        </p>

        <h2>Qué datos se recolectan</h2>
        <ul>
          <li>Nombre, correo institucional y contraseña (guardada solo como huella criptográfica, nunca en texto plano).</li>
          <li>El código que envías, los resultados de la evaluación automática y las marcas de tiempo de cada envío.</li>
          <li>Eventos de uso: laboratorios abiertos, pistas consultadas, preguntas respondidas y uso del simulador.</li>
          <li>Tus respuestas a la encuesta de usabilidad (SUS), si tu curso la activa y decides responderla.</li>
        </ul>

        <h2>Para qué se usan</h2>
        <ul>
          <li>Prestar el servicio: compilar, ejecutar y evaluar tu código y mostrarte la retroalimentación.</li>
          <li>Seguimiento académico: tu docente ve tu progreso y tus envíos en los cursos que dirige.</li>
          <li>
            Investigación, solo si lo autorizas: los datos se exportan con un seudónimo (por ejemplo, E-3F9A2C71D0) que no permite
            identificarte sin una clave que custodia la plataforma. Los análisis se publican de forma agregada.
          </li>
        </ul>

        <h2>Quién puede ver tu código</h2>
        <p>
          Tú, el docente de cada curso en el que enviaste el código y el administrador de la plataforma. Otros estudiantes y otros docentes
          no tienen acceso a tus envíos.
        </p>

        <h2>Tus derechos</h2>
        <p>
          Puedes conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; ser informado sobre su uso; revocar la
          autorización o pedir la supresión de los datos cuando no exista un deber legal o contractual de conservarlos; y presentar quejas
          ante la Superintendencia de Industria y Comercio. La autorización para investigación se puede retirar en cualquier momento desde
          tu perfil, sin efecto alguno sobre tus calificaciones.
        </p>

        <h2>Seguridad y conservación</h2>
        <p>
          La plataforma funciona en la infraestructura de {institucion}, con acceso por roles y bajo sus controles de seguridad. Los
          programas se ejecutan en un entorno aislado y con límites de recursos. Los datos se conservan durante el periodo académico y el
          estudio; después se eliminan o se anonimizan.
        </p>
      </main>
    </div>
  );
}
