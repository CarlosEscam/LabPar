# LabPar: laboratorios virtuales de programación paralela

LabPar es la plataforma web del Proyecto 12, *Plataforma de enseñanza de programación paralela con recursos locales* (Ingeniería de Sistemas, Universidad de Pamplona). Los estudiantes escriben programas con **OpenMP**, **MPI** y **CUDA** en el navegador. Los nodos de cómputo de la propia Universidad los compilan, los ejecutan en un entorno aislado y los evalúan de forma automática:

- verifican la **corrección** con casos de prueba ejecutados con varios valores de *p* (hilos o procesos), lo que permite detectar condiciones de carrera, no determinismo e interbloqueos;
- miden el **rendimiento**: aceleración, eficiencia y fracción serial de Karp–Flatt frente a una versión secuencial de referencia;
- devuelven **retroalimentación formativa** en español: errores del compilador explicados, diagnóstico del fallo según *p* y sugerencias de optimización.

El docente gestiona cursos y laboratorios, sigue el progreso de cada estudiante, consulta la analítica de aprendizaje, aplica la encuesta de usabilidad SUS y exporta datos **seudonimizados** para la investigación, solo de quienes dieron su consentimiento (Ley 1581 de 2012).

| Rol | Qué puede hacer |
|---|---|
| Estudiante | Inscribirse con el código del curso; resolver laboratorios con editor, consola y evaluación; ver su historial; responder preguntas de repaso; usar el simulador de Amdahl y Gustafson; responder la encuesta SUS. |
| Docente | Crear cursos y asignar laboratorios con fecha límite e intentos; ver la matriz de progreso y el código de cada envío; consultar la analítica (dificultades frecuentes, tiempos hasta aceptar, aceleraciones); crear, duplicar, importar y exportar laboratorios; activar la encuesta y exportar CSV. |
| Administrador | Todo lo anterior, más la gestión de cuentas y el estado de los nodos de cómputo. |

## Capturas

| | |
|---|---|
| ![Ingreso](../documentacion/tecnica/capturas/01-ingreso.png) | ![Laboratorio con resultado aceptado](../documentacion/tecnica/capturas/03-laboratorio-aceptado.png) |
| Ingreso, con la ley de Amdahl dibujada sobre papel de ingeniería | Espacio de trabajo: enunciado, editor y resultado de la evaluación |
| ![Condición de carrera](../documentacion/tecnica/capturas/03b-condicion-de-carrera.png) | ![Rendimiento](../documentacion/tecnica/capturas/04-rendimiento.png) |
| Diagnóstico de una condición de carrera | Aceleración frente a la ideal y al objetivo de eficiencia |
| ![Progreso del curso](../documentacion/tecnica/capturas/05-progreso.png) | ![Analítica](../documentacion/tecnica/capturas/06-analitica.png) |
| Matriz de progreso del docente | Analítica de aprendizaje |
| ![Simulador](../documentacion/tecnica/capturas/07-simulador.png) | ![Encuesta SUS](../documentacion/tecnica/capturas/08-encuesta-sus.png) |
| Simulador de Amdahl y Gustafson | Resultados de la encuesta SUS frente a la hipótesis H2 |

## Arquitectura en una línea

`navegador (React)` → `nginx` → `API REST (FastAPI)` → `PostgreSQL (cola de envíos)` ← `trabajadores del motor (Python + gcc/OpenMP, Open MPI, nvcc)`.

La API nunca ejecuta código de estudiantes. Los trabajadores reclaman los envíos de la cola de forma atómica, compilan y ejecutan cada programa como un usuario sin privilegios, con límites de CPU, memoria, procesos y archivos y sin acceso a la red, y guardan el resultado. Se pueden agregar trabajadores en el mismo nodo o en otros nodos que vean la misma base de datos. Los detalles están en [documentacion/tecnica/arquitectura.md](../documentacion/tecnica/arquitectura.md).

## Instalación con Docker (recomendada)

### Requisitos

- **Linux** (servidor o estación de la Universidad) con Docker Engine 24 o superior y el complemento Compose v2, o **Windows 10/11** con Docker Desktop y el motor WSL 2.
- 4 GB de RAM y 2 núcleos como mínimo. Para medir la aceleración con sentido, el nodo de los trabajadores debe tener 4 núcleos o más; con un solo núcleo la plataforma evalúa solo la corrección.
- Para CUDA: un nodo Linux con GPU NVIDIA, su controlador y el NVIDIA Container Toolkit.

### Pasos

```bash
# 1. Configuración
cp .env.ejemplo .env          # en Windows (PowerShell): Copy-Item .env.ejemplo .env
#    Edite .env: cambie POSTGRES_PASSWORD, LABPAR_JWT_SECRETO y LABPAR_SEUDONIMO_SECRETO.
#    Genere secretos con:  python -c "import secrets; print(secrets.token_urlsafe(48))"

# 2. Construir e iniciar (la primera vez tarda varios minutos)
docker compose up -d --build

# 3. Contraseña inicial del administrador (si no definió LABPAR_ADMIN_CLAVE)
docker compose exec api cat /datos/clave_admin_inicial.txt
```

Abra `http://localhost:8080` (o `http://IP-del-servidor:8080`), ingrese como administrador y cambie la contraseña desde **Mi perfil**. Después, cree las cuentas de los docentes en **Sistema > Usuarios**. Cada docente crea su curso y comparte el código de inscripción con sus estudiantes.

Para una demostración con datos de ejemplo, ponga `LABPAR_DEMO=true` en `.env` antes del primer arranque. Se crean un curso con código `PPD262` y estas cuentas: `estudiante@labpar.local` / `estudiante123`, `docente@labpar.local` / `docente123` y `admin@labpar.local` / `admin12345`. **No use el modo demostración con estudiantes reales.**

### Operación

| Tarea | Comando |
|---|---|
| Ver el estado y los registros | `docker compose ps` y `docker compose logs -f trabajador` |
| Más trabajadores en el mismo nodo | `docker compose up -d --scale trabajador=2`, o suba `LABPAR_TRABAJADORES` |
| Agregar un nodo con GPU | `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build` |
| Copia de seguridad | `./scripts/respaldar.sh` (genera `respaldos/labpar-AAAAMMDD-HHMM.sql.gz`) |
| Restaurar una copia | `./scripts/restaurar.sh respaldos/archivo.sql.gz` |
| Actualizar a una versión nueva | `git pull` y `docker compose up -d --build` (los datos están en volúmenes) |

### Seguridad en producción

- Publique la plataforma por **HTTPS**, detrás del proxy inverso institucional o agregando los certificados a `frontend/nginx/labpar.conf`. Ajuste `LABPAR_CORS` a la dirección pública.
- La base de datos, la API y los trabajadores usan una red interna de Docker sin salida a Internet. Solo el servicio `web` publica un puerto.
- Los programas de los estudiantes se ejecutan como el usuario `alumno` (uid 2000), con límites de recursos y la red bloqueada. Para bloquear la red, el contenedor del trabajador necesita la capacidad `NET_ADMIN`, ya incluida en `docker-compose.yml`. La memoria total de los programas MPI y CUDA la acota `LABPAR_MEMORIA_TRABAJADOR`.
- Guarde `.env` fuera del control de versiones y no cambie `LABPAR_SEUDONIMO_SECRETO` durante el estudio: los seudónimos de los estudiantes dependen de él.

## Desarrollo sin Docker

El motor usa llamadas de Linux para aislar los programas (`setrlimit`, grupos de procesos, cambio de usuario). Por eso los trabajadores necesitan **Linux**. En Windows, use **WSL 2** con Ubuntu 24.04 para todo el entorno de desarrollo.

```bash
# Dependencias del sistema (Ubuntu 24.04)
sudo apt install python3-venv gcc g++ make openmpi-bin libopenmpi-dev nodejs npm

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
LABPAR_DEMO=true uvicorn labpar.main:app --reload --port 8000     # terminal 1: API (SQLite en backend/datos)
LABPAR_DEMO=true python -m labpar.worker --trabajadores 2         # terminal 2: trabajadores

# Frontend (Node 22.22 o superior)
cd frontend
npm install
npm run dev                                                       # terminal 3: http://localhost:5173
```

Sin `LABPAR_UID_SANDBOX`, el trabajador ejecuta los programas con el usuario actual. Es aceptable en desarrollo; en producción use Docker o defina un usuario sin privilegios, como se describe en la arquitectura. También se puede servir la interfaz compilada desde la API, en un solo proceso: `npm run build` y luego `LABPAR_FRONTEND=../frontend/dist uvicorn labpar.main:app`.

### Pruebas

```bash
cd backend && python -m pytest -q        # 23 pruebas: API, permisos, privacidad, motor, banco y cola
# La misma suite contra PostgreSQL:
LABPAR_PRUEBAS_DATABASE_URL=postgresql+psycopg://usuario:clave@localhost:5432/labpar_pruebas python -m pytest -q
python -m labpar.banco verificar         # evalúa la solución docente y la plantilla de cada laboratorio del banco

cd frontend && npm run build             # verificación de tipos (TypeScript) y compilación
```

## Configuración

Todas las variables empiezan por `LABPAR_`. Las principales están documentadas en [.env.ejemplo](.env.ejemplo).

| Variable | Valor por defecto | Uso |
|---|---|---|
| `DATABASE_URL` | SQLite en `DATOS/labpar.db` | En producción, `postgresql+psycopg://…` |
| `DATOS` | `backend/datos` | Secretos generados, contraseña inicial y directorios de trabajo |
| `JWT_SECRETO`, `SEUDONIMO_SECRETO` | se generan y se guardan en `DATOS` | Firma de sesiones y clave de los seudónimos |
| `JWT_HORAS` | 12 | Duración de la sesión |
| `REGISTRO_ABIERTO` | true | Autorregistro de estudiantes con código de curso |
| `DEMO` | false | Datos de demostración |
| `TRABAJADORES` | 2 | Procesos trabajadores por nodo |
| `UID_SANDBOX`, `GID_SANDBOX` | — | Usuario sin privilegios para ejecutar los programas |
| `MAX_ENVIOS_SIMULTANEOS` | 3 | Envíos en proceso por usuario |
| `MAX_HILOS_EJECUCION` | máx(8, núcleos) | Tope de *p* en la consola |
| `TIEMPO_MAXIMO_TRABAJO_S` | 600 | Tras este tiempo, un envío huérfano vuelve a la cola |
| `INSTITUCION`, `CONTACTO_DATOS` | Universidad de Pamplona, vacío | Se muestran en la política de tratamiento de datos |

## Estructura del código

```
backend/
  labpar/            API (rutas/), modelo de datos, seguridad, analítica, estadística y semilla
    motor/           motor de evaluación: aislamiento, compilación, comparación, heurísticas, puntaje
    banco/           9 laboratorios (4 OpenMP, 3 MPI, 2 CUDA) con enunciado, plantilla, referencia y casos
    worker.py        trabajadores y cola
  tests/             pruebas automatizadas (pytest)
  Dockerfile, Dockerfile.trabajador, docker/entrada-trabajador.sh
frontend/
  src/paginas/       pantallas (inicio, curso, laboratorio, editor de laboratorios, analítica, simulador…)
  src/componentes/   editor de código, resultados, gráficas, interfaz común
  nginx/             configuración del servidor web
scripts/             copias de seguridad
docker-compose.yml, docker-compose.gpu.yml, .env.ejemplo
```

La documentación técnica (arquitectura, guía para crear laboratorios, manual de uso resumido y capturas) está en [`../documentacion/tecnica/`](../documentacion/tecnica/).

## Estado y limitaciones conocidas

- **Probado.** El backend pasa la suite de pruebas con SQLite y con PostgreSQL 16, en Python 3.12 y 3.13. Las soluciones docentes de OpenMP y MPI del banco obtienen 100 puntos en el motor, también con la red bloqueada para el usuario del aislamiento. La interfaz se verificó de punta a punta en Chromium: escritorio, móvil, tema claro y oscuro, y la configuración de nginx con su política de seguridad de contenido.
- **CUDA.** El código de los laboratorios de CUDA se comprobó compilándolo con clang en modo CUDA, porque el entorno de desarrollo no tenía GPU ni nvcc. Ejecutarlos y medirlos requiere un nodo con GPU NVIDIA; sin él, la plataforma registra el envío y responde «modelo no disponible».
- **Imágenes de contenedor.** Las imágenes se construyeron y ejecutaron en Windows 11 con Docker Desktop 4.92.0 (Docker Engine 29.8.0) en un equipo de 16 núcleos lógicos: los cuatro servicios quedaron en ejecución, el aislamiento de red del trabajador se activó y la solución docente de «Suma paralela con reducción» obtuvo 100 puntos. El procedimiento completo está en el Manual de Instalación (carpeta `manuales/` del repositorio).
- **Trabajo futuro**, previsto en el documento del proyecto: ejecución MPI en varios nodos mediante Slurm (hoy los procesos MPI corren en un mismo nodo), integración con el LMS institucional mediante LTI 1.3, y migraciones de esquema con Alembic. Hoy las tablas se crean al iniciar.

## Autores

Carlos Alberto Escamilla Mariño, Kevin Andrés Rojas Marín y Juan Felipe Portilla Galvis. Programa de Ingeniería de Sistemas, Universidad de Pamplona, 2026.
