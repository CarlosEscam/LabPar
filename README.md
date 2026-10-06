# LabPar · Proyecto 12

**Plataforma de enseñanza de programación paralela con recursos locales.** LabPar es una plataforma web de laboratorios virtuales de OpenMP, MPI y CUDA. Se ejecuta en los equipos de cómputo de la propia Universidad y evalúa automáticamente la corrección y el rendimiento de los programas: aceleración, eficiencia y fracción serial de Karp–Flatt.

Curso Programación Paralela y Distribuida · Ingeniería de Sistemas · Universidad de Pamplona · 2026.

## Contenido del repositorio

| Carpeta | Contenido |
|---|---|
| [`labpar/`](labpar/) | Código fuente de la plataforma: API y motor de evaluación (Python, FastAPI), interfaz web (React, TypeScript), banco de 9 laboratorios, pruebas automáticas y despliegue con Docker Compose. |
| [`manuales/`](manuales/) | Manual de Instalación (Anexo A) y Manual de Usuario (Anexo B), en Word, con estilo IEEE y estructura ISO/IEC/IEEE 26514. |
| [`documentacion/`](documentacion/) | Documentación técnica (arquitectura, guía para crear laboratorios, manual de uso resumido, resumen de implementación y capturas) y documentos del curso. |
| [`informe/`](informe/) | Informe final del proyecto en formato IEEE, propuesta del proyecto y referencias bibliográficas (BibTeX y RIS). |

## Inicio rápido

Requisitos: Docker Desktop con WSL 2 (Windows 10/11) o Docker Engine con Compose v2 (Linux).

```bash
cd labpar
cp .env.ejemplo .env          # en PowerShell: Copy-Item .env.ejemplo .env
# Edite .env y cambie POSTGRES_PASSWORD, LABPAR_JWT_SECRETO y LABPAR_SEUDONIMO_SECRETO
docker compose up -d --build
```

Abra `http://localhost:8080`. El procedimiento paso a paso, con capturas, está en el **Manual de Instalación** (`manuales/`). Los detalles de operación y desarrollo están en [`labpar/README.md`](labpar/README.md).

## Integración continua

Cada cambio en `labpar/` ejecuta el flujo [`.github/workflows/integracion.yml`](.github/workflows/integracion.yml):
- pruebas del backend con SQLite y PostgreSQL;
- verificación del banco de laboratorios;
- compilación de la interfaz;
- construcción de las imágenes de contenedor.

## Autores

- Carlos Alberto Escamilla Mariño
- Kevin Andrés Rojas Marín
- Juan Felipe Portilla Galvis

Programa de Ingeniería de Sistemas, Facultad de Ingenierías y Arquitectura, Universidad de Pamplona.

> El archivo `.env` con las contraseñas de cada instalación no se versiona (ver `labpar/.gitignore`).
