"""Esquemas de entrada y salida de la API (Pydantic v2)."""
from __future__ import annotations

from datetime import datetime
import re
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

Rol = Literal["estudiante", "docente", "admin"]
Modelo = Literal["openmp", "mpi", "cuda"]
Lenguaje = Literal["c", "cpp", "cuda"]
Nivel = Literal["basico", "intermedio", "avanzado"]

_PATRON_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validar_email(valor: str) -> str:
    """Valida la forma del correo sin rechazar dominios internos (p. ej. ``.local`` en una red universitaria)."""
    valor = valor.strip().lower()
    if len(valor) > 254 or not _PATRON_EMAIL.match(valor):
        raise ValueError("El correo electrónico no es válido")
    return valor


Email = Annotated[str, AfterValidator(_validar_email)]


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------------------------- Usuarios y sesión
class UsuarioOut(Base):
    id: int
    nombre: str
    email: str
    rol: Rol
    activo: bool = True
    consentimiento_investigacion: bool
    creado_en: datetime
    ultimo_ingreso: datetime | None = None


class RegistroIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    email: Email
    clave: str = Field(min_length=8, max_length=200)
    codigo_inscripcion: str | None = Field(default=None, max_length=16)
    acepta_terminos: bool
    consentimiento_investigacion: bool = False

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("El nombre es demasiado corto")
        return v


class IngresoIn(BaseModel):
    email: Email
    clave: str = Field(min_length=1, max_length=200)


class TokenOut(BaseModel):
    token: str
    usuario: UsuarioOut


class PerfilIn(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    consentimiento_investigacion: bool | None = None
    clave_actual: str | None = None
    clave_nueva: str | None = Field(default=None, min_length=8, max_length=200)


class ConfigPublicaOut(BaseModel):
    registro_abierto: bool
    demo: bool
    cuentas_demo: list[dict[str, str]] = []
    version: str
    institucion: str = ""
    contacto_datos: str = ""


# ----------------------------------------------------------------------------- Cursos
class CursoIn(BaseModel):
    nombre: str = Field(min_length=3, max_length=160)
    periodo: str = Field(default="", max_length=40)
    descripcion: str = Field(default="", max_length=4000)


class CursoPatch(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=160)
    periodo: str | None = Field(default=None, max_length=40)
    descripcion: str | None = Field(default=None, max_length=4000)
    encuesta_sus_activa: bool | None = None
    activo: bool | None = None


class CursoOut(Base):
    id: int
    nombre: str
    periodo: str
    descripcion: str
    docente_id: int
    docente_nombre: str
    codigo_inscripcion: str | None = None
    encuesta_sus_activa: bool
    activo: bool
    num_estudiantes: int = 0
    num_asignaciones: int = 0
    creado_en: datetime


class InscripcionIn(BaseModel):
    codigo: str = Field(min_length=4, max_length=16)


class EstudianteCursoOut(BaseModel):
    id: int
    nombre: str
    email: str
    inscrito_en: datetime
    envios: int
    aceptados: int
    ultimo_envio: datetime | None


# ----------------------------------------------------------------------------- Laboratorios
class LabResumen(Base):
    id: int
    slug: str
    titulo: str
    modelo: Modelo
    lenguaje: Lenguaje
    nivel: Nivel
    orden: int
    resumen: str
    conceptos: list[Any]
    duracion_estimada_min: int
    publicado: bool
    del_banco: bool
    version: int
    autor_id: int | None = None


class CasoVisible(BaseModel):
    id: int
    nombre: str
    entrada: str
    salida_esperada: str


class CasoOut(Base):
    id: int
    nombre: str
    entrada: str
    salida_esperada: str
    visible: bool
    peso: float
    orden: int


class CasoIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    entrada: str = Field(default="", max_length=200_000)
    salida_esperada: str = Field(default="", max_length=200_000)
    visible: bool = False
    peso: float = Field(default=1.0, gt=0, le=100)
    orden: int | None = None


class LabEstudiante(LabResumen):
    enunciado_md: str
    plantilla: str
    objetivos: list[Any]
    preguntas: list[Any]
    pistas: list[Any]
    evaluacion: dict[str, Any]
    casos_visibles: list[CasoVisible]


class LabDocente(LabEstudiante):
    solucion_referencia: str
    solucion_docente: str
    config: dict[str, Any]
    casos: list[CasoOut]
    actualizado_en: datetime
    puede_editar: bool = False


class BorradorIn(BaseModel):
    codigo: str = Field(max_length=200_000)


class BorradorOut(BaseModel):
    codigo: str | None
    actualizado_en: datetime | None


class Objetivo(BaseModel):
    nivel: str = Field(default="", max_length=40)
    texto: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="before")
    @classmethod
    def _desde_texto(cls, datos: Any) -> Any:
        # Formato antiguo: el objetivo era solo un texto.
        return {"texto": datos} if isinstance(datos, str) else datos


class Pregunta(BaseModel):
    pregunta: str = Field(min_length=1, max_length=2000)
    opciones: list[Annotated[str, Field(min_length=1, max_length=1000)]] = Field(min_length=2, max_length=8)
    correcta: int = Field(ge=0)
    explicacion: str = Field(default="", max_length=4000)

    @model_validator(mode="after")
    def _correcta_en_rango(self) -> "Pregunta":
        if self.correcta >= len(self.opciones):
            raise ValueError("La respuesta correcta debe ser una de las opciones")
        return self


class LabIn(BaseModel):
    titulo: str = Field(min_length=3, max_length=200)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9\-]{2,79}$")
    modelo: Modelo
    lenguaje: Lenguaje = "c"
    nivel: Nivel = "basico"
    orden: int = 100
    resumen: str = Field(default="", max_length=2000)
    enunciado_md: str = Field(default="", max_length=200_000)
    plantilla: str = Field(default="", max_length=200_000)
    solucion_referencia: str = Field(default="", max_length=200_000)
    solucion_docente: str = Field(default="", max_length=200_000)
    config: dict[str, Any] = {}
    objetivos: list[Objetivo] = []
    conceptos: list[Annotated[str, Field(min_length=1, max_length=120)]] = []
    preguntas: list[Pregunta] = []
    pistas: list[Annotated[str, Field(min_length=1, max_length=2000)]] = []
    duracion_estimada_min: int = Field(default=45, ge=5, le=600)
    publicado: bool = True


# ----------------------------------------------------------------------------- Asignaciones
class AsignacionIn(BaseModel):
    laboratorio_id: int
    fecha_limite: datetime | None = None
    intentos_max: int | None = Field(default=None, ge=1, le=1000)


class AsignacionPatch(BaseModel):
    fecha_limite: datetime | None = None
    intentos_max: int | None = Field(default=None, ge=1, le=1000)


class AsignacionOut(BaseModel):
    id: int
    curso_id: int
    laboratorio: LabResumen
    fecha_limite: datetime | None
    intentos_max: int | None
    creado_en: datetime
    # Vista del estudiante
    estado: str | None = None
    intentos: int | None = None
    mejor_puntaje: float | None = None
    # Vista del docente
    estudiantes_con_intentos: int | None = None
    estudiantes_aceptados: int | None = None


# ----------------------------------------------------------------------------- Envíos
class EnvioIn(BaseModel):
    laboratorio_id: int
    curso_id: int | None = None
    codigo: str = Field(min_length=1, max_length=200_000)
    tipo: Literal["evaluacion", "ejecucion"] = "evaluacion"
    hilos: int | None = Field(default=None, ge=1, le=256)
    entrada: str | None = Field(default=None, max_length=100_000)


class EnvioResumen(Base):
    id: int
    usuario_id: int
    laboratorio_id: int
    curso_id: int | None
    tipo: str
    estado: str
    veredicto: str | None
    puntaje: float | None
    correcto: bool
    aceleracion: float | None
    eficiencia: float | None
    creado_en: datetime
    iniciado_en: datetime | None
    finalizado_en: datetime | None
    parametros: dict[str, Any] = {}


class EnvioOut(EnvioResumen):
    resultado: dict[str, Any] | None = None
    posicion_cola: int | None = None
    usuario_nombre: str | None = None
    laboratorio_titulo: str | None = None


class EventoIn(BaseModel):
    tipo: Literal["lab_abierto", "pista_vista", "cuestionario_respondido", "simulador_usado", "enunciado_leido"]
    laboratorio_id: int | None = None
    curso_id: int | None = None
    datos: dict[str, Any] = {}


# ----------------------------------------------------------------------------- SUS
class SUSIn(BaseModel):
    respuestas: list[int] = Field(min_length=10, max_length=10)

    @field_validator("respuestas")
    @classmethod
    def _rango(cls, v: list[int]) -> list[int]:
        if any(x < 1 or x > 5 for x in v):
            raise ValueError("Cada respuesta debe estar entre 1 y 5")
        return v


class SUSEstadoOut(BaseModel):
    activa: bool
    respondida: bool
    puntaje: float | None = None


# ----------------------------------------------------------------------------- Administración
class UsuarioAdminIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    email: Email
    clave: str = Field(min_length=8, max_length=200)
    rol: Rol = "docente"


class UsuarioAdminPatch(BaseModel):
    rol: Rol | None = None
    activo: bool | None = None
    clave: str | None = Field(default=None, min_length=8, max_length=200)
