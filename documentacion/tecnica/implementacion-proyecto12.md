# LabPar: implementación del prototipo (insumo para el capítulo de Desarrollo)

Este documento resume la construcción del prototipo funcional de la plataforma del Proyecto 12 (OE3). Sirve de insumo para redactar los capítulos de Desarrollo y Resultados con el formato IEEE del documento final. El código fuente, la documentación técnica y las capturas están en el paquete `LabPar_Proyecto12.zip` (carpeta `labpar/`).

## 1. Alcance del prototipo

La plataforma se construyó como una aplicación web de tres niveles, desplegable con contenedores sobre los recursos locales de la Universidad. Implementa las ocho épicas del Product Backlog inicial (Tabla VII del documento), con dos excepciones previstas como opcionales: la integración LTI 1.3 con el LMS (E1) y la planificación multinodo con Slurm (E3). Incluye un banco inicial de nueve laboratorios: cuatro de OpenMP, tres de MPI y dos de CUDA. Cada uno tiene objetivos de aprendizaje según la taxonomía de Bloom, enunciado, plantilla, solución de referencia secuencial, solución del docente, casos de prueba visibles y ocultos, pistas y preguntas de repaso.

## 2. Tecnologías seleccionadas

| Capa | Tecnología (versión) | Justificación |
|---|---|---|
| Presentación | React 19.3, TypeScript 7.0, Vite 8.3, React Router 8.4 | Ecosistema maduro, tipado estático y compilación rápida |
| Editor de código | CodeMirror 6 con gramática C/C++ | Liviano y accesible; permite marcar en el código los errores del compilador y resaltar las construcciones paralelas |
| Enunciados | react-markdown con KaTeX | Fórmulas como $S_p = T_1/T_p$ en el navegador |
| Servicios | Python 3.12/3.13, FastAPI 0.142, Pydantic 2.13 | API REST con documentación OpenAPI automática y validación de datos |
| Datos | PostgreSQL 16 (producción), SQLite (desarrollo), SQLAlchemy 2.1 | La misma suite de pruebas corre contra ambos motores |
| Seguridad | JWT (PyJWT), bcrypt, HMAC para seudónimos | Sesiones sin estado, contraseñas con huella criptográfica y seudonimización estable |
| Motor | gcc 13 con libgomp, Open MPI 4.1, CUDA 12.6 (nvcc) | Herramientas estándar de la asignatura |
| Despliegue | Docker Compose, nginx 1.28 | Reproducible en cualquier nodo Linux o en Windows con WSL 2 |

## 3. Arquitectura implementada

La implementación sigue la arquitectura de referencia por capas del documento (sección 6.2.4):

- **Presentación**: cliente web de una sola página. Los roles estudiante, docente y administrador tienen vistas diferenciadas.
- **Servicios**: API REST con 34 rutas, agrupadas en autenticación, cursos, asignaciones, laboratorios, envíos, analítica, encuesta SUS y administración.
- **Orquestación**: cola de envíos persistida en PostgreSQL, con prioridades (ejecución rápida en consola sobre evaluación completa) y reclamo atómico. Varios trabajadores, en uno o varios nodos, consumen la misma cola sin duplicar trabajo. Cada trabajador solo toma los envíos de los modelos que puede ejecutar: los de CUDA esperan a un nodo con GPU.
- **Motor de evaluación**: cinco fases. (1) requisitos y análisis estático; (2) compilación con diagnósticos explicados en español; (3) corrección: cada caso con varios valores de *p* y varias repeticiones; (4) rendimiento con el nodo en uso exclusivo; (5) puntaje y retroalimentación.
- **Recursos locales**: contenedor de trabajador para CPU (OpenMP y MPI) y variante con GPU (CUDA), sobre la misma definición de imagen.

### 3.1 Diagnóstico automático de errores de concurrencia

El aporte didáctico central del motor es interpretar el patrón de fallos según el número de hilos o procesos *p*:

| Patrón observado | Diagnóstico entregado al estudiante |
|---|---|
| Correcto con *p* = 1 e incorrecto con *p* > 1 | Condición de carrera (OpenMP) o reparto incorrecto del trabajo (MPI) |
| Salidas distintas entre repeticiones con el mismo *p* | No determinismo |
| Termina con *p* = 1 y excede el tiempo con *p* > 1 | Interbloqueo (MPI) o espera infinita |
| Incorrecto también con *p* = 1 | Error de lógica o de formato, con la línea de la primera diferencia |

La interfaz presenta esta evidencia como una **matriz de casos × *p* × repeticiones**. El patrón «correcto con un hilo, incorrecto con cuatro» queda visible de inmediato.

### 3.2 Métricas de desempeño y puntaje

Para cada *p* se calculan la aceleración $S_p = T_{ref}/T_p$ frente a una versión secuencial de referencia, la eficiencia $E_p = S_p/p$ y la fracción serial de Karp–Flatt $e = (1/S'_p - 1/p)/(1 - 1/p)$. El tiempo se mide dentro del programa, en la región de interés, y se toma el mínimo de varias repeticiones con el nodo en uso exclusivo. El puntaje pondera la corrección (70 % por defecto) y el rendimiento (30 %). El rendimiento se mide solo si la corrección es completa y se interpola linealmente entre *S* = 1 y el objetivo $S_{obj} = \max(1, E_{obj} \cdot p_{max})$.

### 3.3 Seguridad y aislamiento (E8)

Los programas de los estudiantes se ejecutan como un usuario sin privilegios, con límites de CPU, memoria, procesos, tamaño de archivos y tiempo de reloj. Se ejecutan en un entorno sin credenciales y con la red bloqueada mediante reglas de iptables por usuario. Solo se permite la interfaz local, que usa MPI. La base de datos, la API y los trabajadores comparten una red interna sin salida a Internet. Se agregaron un limitador de intentos de ingreso, cuotas de envíos simultáneos y de intentos por laboratorio, registro de eventos, monitoreo de los nodos y scripts de copia de seguridad.

### 3.4 Protección de datos (Ley 1581 de 2012)

- El registro exige aceptar el tratamiento de datos. El consentimiento para investigación es opcional y revocable.
- El código de un estudiante solo lo ven él, el docente de su curso y el administrador.
- Las exportaciones para la investigación incluyen únicamente a quienes consintieron, identificados con un seudónimo HMAC estable.
- El docente conoce el número de consentimientos, pero no quiénes los dieron, para evitar presión sobre los participantes.

### 3.5 Soporte a la evaluación del estudio (fase 4)

La plataforma recolecta las variables de la Tabla IV del documento:

- registros de uso: envíos, intentos y tiempos desde la apertura del laboratorio hasta el primer envío aceptado (hipótesis H3);
- encuesta SUS integrada, con media, desviación estándar, intervalo de confianza del 95 %, prueba *t* de una muestra frente a 70 y *d* de Cohen (hipótesis H2). Las funciones estadísticas se validaron contra SciPy;
- exportaciones CSV listas para el análisis en pandas, SciPy o statsmodels.

## 4. Verificación

| Prueba | Resultado |
|---|---|
| Suite automatizada del backend (pytest): autenticación, permisos, privacidad de envíos, cursos, flujo de envío, analítica, encuesta, banco, motor y cola | 21 de 21 aprobadas con SQLite y con PostgreSQL 16, en Python 3.12 y 3.13 |
| Soluciones docentes del banco (OpenMP y MPI) | Aceptadas con 100 puntos, también con la red bloqueada para el usuario aislado |
| Detección de errores | Condición de carrera, no determinismo, interbloqueo MPI (resuelto en menos de 60 s gracias a la falla rápida), violación de segmento, tiempo excedido y error de compilación |
| Recorrido de punta a punta en navegador (Playwright, compilación de producción tras nginx con política CSP) | El docente crea un curso y asigna laboratorios; un estudiante se registra con el código, envía una versión con condición de carrera (diagnosticada) y la corrige (aceptada); el docente revisa el progreso y el código; se responde y analiza la encuesta SUS; se crea un laboratorio nuevo y se verifica su solución; el administrador crea una cuenta. Sin errores de JavaScript ni de CSP |
| Interfaz | Revisión visual en escritorio y móvil (390 px, sin desbordamiento horizontal), con tema claro y oscuro |

Tiempos observados en un nodo de 2 núcleos: ejecución en consola, menos de 1 s; evaluación completa de OpenMP, entre 3 y 6 s; de MPI, entre 11 y 14 s. MPI tarda más por el arranque de `mpirun` en cada ejecución.

## 5. Limitaciones y trabajo futuro

1. Los laboratorios de CUDA se verificaron hasta la compilación porque el entorno de desarrollo no tenía GPU. Su ejecución requiere un nodo con GPU NVIDIA y el NVIDIA Container Toolkit.
2. Las imágenes de Docker no se construyeron en el entorno de desarrollo, que no tenía acceso al registro de imágenes. Sus archivos se validaron con `docker compose config` y sus pasos se reprodujeron por separado. La primera construcción debe hacerse en el servidor de la Universidad.
3. MPI se ejecuta en un solo nodo. La ejecución multinodo con Slurm y la integración LTI 1.3 quedan como trabajo futuro.
4. El esquema de la base de datos se crea al iniciar. Para actualizaciones con datos en producción convendría incorporar migraciones con Alembic.
5. La medición del rendimiento es sensible a la carga del nodo. Para el estudio se recomienda un nodo dedicado a los trabajadores, con al menos 8 núcleos, para que *p* ∈ {1, 2, 4, 8} sea medible.
