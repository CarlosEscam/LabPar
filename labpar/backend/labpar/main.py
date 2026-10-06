"""Aplicación FastAPI (capa de servicios de la arquitectura de referencia)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import config
from .db import SesionLocal, crear_tablas
from .rutas import analitica, auth, cursos, envios, laboratorios, otros
from .semilla import sembrar

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("labpar")


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    crear_tablas()
    if config.sembrar_al_iniciar:
        with SesionLocal() as db:
            resumen = sembrar(db, demo=config.modo_demo)
        log.info("Banco de laboratorios sincronizado: %s", resumen)
    yield


def crear_app() -> FastAPI:
    app = FastAPI(
        title="LabPar · API",
        description="Plataforma de enseñanza de programación paralela con recursos locales (OpenMP, MPI y CUDA).",
        version=__version__,
        lifespan=ciclo_de_vida,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.cors_origenes),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for modulo in (auth, cursos, laboratorios, envios, analitica, otros):
        app.include_router(modulo.router, prefix="/api")

    frontend = config.directorio_frontend
    if frontend and (frontend / "index.html").exists():
        _servir_frontend(app, frontend)
    return app


def _servir_frontend(app: FastAPI, directorio: Path) -> None:
    """Sirve la aplicación web compilada (modo de un solo proceso, sin nginx)."""
    if (directorio / "assets").exists():
        app.mount("/assets", StaticFiles(directory=directorio / "assets"), name="assets")
    indice = directorio / "index.html"

    @app.get("/{ruta:path}", include_in_schema=False)
    def spa(ruta: str):
        if ruta.startswith("api/"):
            raise HTTPException(404, "Ruta de la API inexistente")
        archivo = (directorio / ruta).resolve()
        if ruta and archivo.is_file() and directorio.resolve() in archivo.parents:
            return FileResponse(archivo)
        return FileResponse(indice)


app = crear_app()
