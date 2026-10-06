"""Modelo de datos de la plataforma."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, FechaHoraUTC, ahora

ROLES = ("estudiante", "docente", "admin")
MODELOS = ("openmp", "mpi", "cuda")
LENGUAJES = ("c", "cpp", "cuda")
NIVELES = ("basico", "intermedio", "avanzado")
TIPOS_ENVIO = ("evaluacion", "ejecucion", "referencia")
ESTADOS_ENVIO = ("pendiente", "ejecutando", "completado", "error")


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    hash_clave: Mapped[str] = mapped_column(String(200))
    rol: Mapped[str] = mapped_column(String(20), default="estudiante")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    consentimiento_investigacion: Mapped[bool] = mapped_column(Boolean, default=False)
    consentimiento_fecha: Mapped[datetime | None] = mapped_column(FechaHoraUTC, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)
    ultimo_ingreso: Mapped[datetime | None] = mapped_column(FechaHoraUTC, nullable=True)


class Curso(Base):
    __tablename__ = "cursos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(160))
    periodo: Mapped[str] = mapped_column(String(40), default="")
    descripcion: Mapped[str] = mapped_column(Text, default="")
    docente_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    codigo_inscripcion: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    encuesta_sus_activa: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)

    docente: Mapped[Usuario] = relationship()
    inscripciones: Mapped[list[Inscripcion]] = relationship(back_populates="curso", cascade="all, delete-orphan")
    asignaciones: Mapped[list[Asignacion]] = relationship(back_populates="curso", cascade="all, delete-orphan")


class Inscripcion(Base):
    __tablename__ = "inscripciones"
    __table_args__ = (UniqueConstraint("curso_id", "usuario_id", name="uq_inscripcion"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    curso_id: Mapped[int] = mapped_column(ForeignKey("cursos.id", ondelete="CASCADE"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)

    curso: Mapped[Curso] = relationship(back_populates="inscripciones")
    usuario: Mapped[Usuario] = relationship()


class Laboratorio(Base):
    __tablename__ = "laboratorios"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    titulo: Mapped[str] = mapped_column(String(200))
    modelo: Mapped[str] = mapped_column(String(10))
    lenguaje: Mapped[str] = mapped_column(String(10), default="c")
    nivel: Mapped[str] = mapped_column(String(20), default="basico")
    orden: Mapped[int] = mapped_column(Integer, default=100)
    resumen: Mapped[str] = mapped_column(Text, default="")
    enunciado_md: Mapped[str] = mapped_column(Text, default="")
    plantilla: Mapped[str] = mapped_column(Text, default="")
    solucion_referencia: Mapped[str] = mapped_column(Text, default="")
    solucion_docente: Mapped[str] = mapped_column(Text, default="")
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    objetivos: Mapped[list[Any]] = mapped_column(JSON, default=list)
    conceptos: Mapped[list[Any]] = mapped_column(JSON, default=list)
    preguntas: Mapped[list[Any]] = mapped_column(JSON, default=list)
    pistas: Mapped[list[Any]] = mapped_column(JSON, default=list)
    duracion_estimada_min: Mapped[int] = mapped_column(Integer, default=45)
    publicado: Mapped[bool] = mapped_column(Boolean, default=True)
    del_banco: Mapped[bool] = mapped_column(Boolean, default=False)
    # Huella del contenido del banco; se pone en None cuando un docente edita el laboratorio,
    # para que las actualizaciones del banco no sobrescriban sus cambios.
    hash_banco: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)
    actualizado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora, onupdate=ahora)

    casos: Mapped[list[CasoPrueba]] = relationship(
        back_populates="laboratorio", cascade="all, delete-orphan", order_by="CasoPrueba.orden"
    )


class CasoPrueba(Base):
    __tablename__ = "casos_prueba"

    id: Mapped[int] = mapped_column(primary_key=True)
    laboratorio_id: Mapped[int] = mapped_column(ForeignKey("laboratorios.id", ondelete="CASCADE"))
    nombre: Mapped[str] = mapped_column(String(120))
    entrada: Mapped[str] = mapped_column(Text, default="")
    salida_esperada: Mapped[str] = mapped_column(Text, default="")
    visible: Mapped[bool] = mapped_column(Boolean, default=False)
    peso: Mapped[float] = mapped_column(Float, default=1.0)
    orden: Mapped[int] = mapped_column(Integer, default=0)

    laboratorio: Mapped[Laboratorio] = relationship(back_populates="casos")


class Asignacion(Base):
    __tablename__ = "asignaciones"
    __table_args__ = (UniqueConstraint("curso_id", "laboratorio_id", name="uq_asignacion"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    curso_id: Mapped[int] = mapped_column(ForeignKey("cursos.id", ondelete="CASCADE"))
    laboratorio_id: Mapped[int] = mapped_column(ForeignKey("laboratorios.id", ondelete="CASCADE"))
    fecha_limite: Mapped[datetime | None] = mapped_column(FechaHoraUTC, nullable=True)
    intentos_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)

    curso: Mapped[Curso] = relationship(back_populates="asignaciones")
    laboratorio: Mapped[Laboratorio] = relationship()


class Envio(Base):
    __tablename__ = "envios"
    __table_args__ = (
        Index("ix_envios_cola", "estado", "prioridad", "id"),
        Index("ix_envios_usuario_lab", "usuario_id", "laboratorio_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    laboratorio_id: Mapped[int] = mapped_column(ForeignKey("laboratorios.id", ondelete="CASCADE"))
    curso_id: Mapped[int | None] = mapped_column(ForeignKey("cursos.id", ondelete="SET NULL"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(12), default="evaluacion")
    codigo: Mapped[str] = mapped_column(Text)
    parametros: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    estado: Mapped[str] = mapped_column(String(12), default="pendiente")
    prioridad: Mapped[int] = mapped_column(Integer, default=5)
    veredicto: Mapped[str | None] = mapped_column(String(30), nullable=True)
    puntaje: Mapped[float | None] = mapped_column(Float, nullable=True)
    correcto: Mapped[bool] = mapped_column(Boolean, default=False)
    aceleracion: Mapped[float | None] = mapped_column(Float, nullable=True)
    eficiencia: Mapped[float | None] = mapped_column(Float, nullable=True)
    resultado: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    trabajador: Mapped[str | None] = mapped_column(String(120), nullable=True)
    intentos_proceso: Mapped[int] = mapped_column(Integer, default=0)
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)
    iniciado_en: Mapped[datetime | None] = mapped_column(FechaHoraUTC, nullable=True)
    finalizado_en: Mapped[datetime | None] = mapped_column(FechaHoraUTC, nullable=True)

    usuario: Mapped[Usuario] = relationship()
    laboratorio: Mapped[Laboratorio] = relationship()


class Evento(Base):
    __tablename__ = "eventos"
    __table_args__ = (Index("ix_eventos_usuario_tipo", "usuario_id", "tipo"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    tipo: Mapped[str] = mapped_column(String(40))
    laboratorio_id: Mapped[int | None] = mapped_column(ForeignKey("laboratorios.id", ondelete="SET NULL"), nullable=True)
    curso_id: Mapped[int | None] = mapped_column(ForeignKey("cursos.id", ondelete="SET NULL"), nullable=True)
    datos: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)


class Borrador(Base):
    """Último código del estudiante en un laboratorio (autoguardado), para retomarlo desde cualquier equipo."""

    __tablename__ = "borradores"
    __table_args__ = (UniqueConstraint("usuario_id", "laboratorio_id", name="uq_borrador"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    laboratorio_id: Mapped[int] = mapped_column(ForeignKey("laboratorios.id", ondelete="CASCADE"))
    codigo: Mapped[str] = mapped_column(Text)
    actualizado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora, onupdate=ahora)


class RespuestaSUS(Base):
    __tablename__ = "respuestas_sus"
    __table_args__ = (UniqueConstraint("usuario_id", "curso_id", name="uq_sus"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    curso_id: Mapped[int] = mapped_column(ForeignKey("cursos.id", ondelete="CASCADE"))
    respuestas: Mapped[list[int]] = mapped_column(JSON)
    puntaje: Mapped[float] = mapped_column(Float)
    creado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)


class Trabajador(Base):
    """Latido de cada proceso trabajador del motor de evaluación."""

    __tablename__ = "trabajadores"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    host: Mapped[str] = mapped_column(String(120))
    pid: Mapped[int] = mapped_column(Integer)
    capacidades: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    estado: Mapped[str] = mapped_column(String(20), default="libre")
    envio_actual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    procesados: Mapped[int] = mapped_column(Integer, default=0)
    fallidos: Mapped[int] = mapped_column(Integer, default=0)
    iniciado_en: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)
    ultimo_latido: Mapped[datetime] = mapped_column(FechaHoraUTC, default=ahora)
