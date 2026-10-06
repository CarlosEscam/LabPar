"""Lógica compartida entre rutas: serialización, filtros de privacidad y registro de eventos."""
from __future__ import annotations

import copy
import secrets
from typing import Any

from sqlalchemy.orm import Session

from .modelos import Envio, Evento, Laboratorio
from .motor.evaluador import configuracion_efectiva

ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generar_codigo(longitud: int = 6) -> str:
    return "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(longitud))


def lab_resumen(lab: Laboratorio) -> dict[str, Any]:
    return {
        "id": lab.id,
        "slug": lab.slug,
        "titulo": lab.titulo,
        "modelo": lab.modelo,
        "lenguaje": lab.lenguaje,
        "nivel": lab.nivel,
        "orden": lab.orden,
        "resumen": lab.resumen,
        "conceptos": lab.conceptos or [],
        "duracion_estimada_min": lab.duracion_estimada_min,
        "publicado": lab.publicado,
        "del_banco": lab.del_banco,
        "version": lab.version,
        "autor_id": lab.autor_id,
    }


def evaluacion_publica(lab: Laboratorio) -> dict[str, Any]:
    """Resumen de los criterios de evaluación que se muestra al estudiante (sin entradas ocultas)."""
    cfg = configuracion_efectiva(lab.config)
    return {
        "hilos_correccion": [1] if lab.modelo == "cuda" else cfg["hilos_correccion"],
        "repeticiones_correccion": cfg["repeticiones_correccion"],
        "hilos_rendimiento": [1] if lab.modelo == "cuda" else cfg["hilos_rendimiento"],
        "repeticiones_rendimiento": cfg["repeticiones_rendimiento"],
        "tiempo_limite_s": cfg["tiempo_limite_s"],
        "comparacion": cfg["comparacion"],
        "tolerancia_rel": cfg["tolerancia_rel"],
        "peso_correccion": cfg["peso_correccion"],
        "peso_rendimiento": cfg["peso_rendimiento"],
        "eficiencia_objetivo": None if lab.modelo == "cuda" else cfg["eficiencia_objetivo"],
        "aceleracion_objetivo": cfg["aceleracion_objetivo"] if lab.modelo == "cuda" else None,
        "mide_rendimiento": bool(cfg.get("entrada_rendimiento")),
        "requisitos": [r["mensaje"] for r in cfg.get("requisitos") or []],
        "prohibidos": [r["mensaje"] for r in cfg.get("prohibidos") or []],
        "num_casos": len(lab.casos),
        "num_casos_ocultos": sum(1 for c in lab.casos if not c.visible),
    }


def lab_estudiante(lab: Laboratorio) -> dict[str, Any]:
    datos = lab_resumen(lab)
    datos.update(
        enunciado_md=lab.enunciado_md,
        plantilla=lab.plantilla,
        objetivos=lab.objetivos or [],
        preguntas=lab.preguntas or [],
        pistas=lab.pistas or [],
        evaluacion=evaluacion_publica(lab),
        casos_visibles=[
            {"id": c.id, "nombre": c.nombre, "entrada": c.entrada, "salida_esperada": c.salida_esperada}
            for c in lab.casos
            if c.visible
        ],
    )
    return datos


def lab_docente(lab: Laboratorio) -> dict[str, Any]:
    datos = lab_estudiante(lab)
    datos.update(
        solucion_referencia=lab.solucion_referencia,
        solucion_docente=lab.solucion_docente,
        config=lab.config or {},
        casos=[
            {"id": c.id, "nombre": c.nombre, "entrada": c.entrada, "salida_esperada": c.salida_esperada,
             "visible": c.visible, "peso": c.peso, "orden": c.orden}
            for c in lab.casos
        ],
        actualizado_en=lab.actualizado_en,
    )
    return datos


def casos_para_motor(lab: Laboratorio) -> list[dict[str, Any]]:
    return [
        {"id": c.id, "nombre": c.nombre, "entrada": c.entrada, "salida_esperada": c.salida_esperada,
         "visible": c.visible, "peso": c.peso}
        for c in lab.casos
    ]


def filtrar_resultado(resultado: dict[str, Any] | None, personal: bool) -> dict[str, Any] | None:
    """Oculta a los estudiantes la entrada, la salida esperada y la obtenida de los casos ocultos."""
    if resultado is None or personal:
        return resultado
    filtrado = copy.deepcopy(resultado)
    for caso in (filtrado.get("correccion") or {}).get("casos", []):
        if not caso.get("visible"):
            caso["entrada"] = None
            caso["esperada"] = None
            detalle = caso.get("detalle")
            if detalle:
                detalle["stdout"] = None
                comp = detalle.get("comparacion")
                if comp:
                    comp["esperado"] = None
                    comp["obtenido"] = None
    if filtrado.get("tipo") == "referencia":
        filtrado.pop("casos", None)
    return filtrado


def aplicar_resultado(envio: Envio, resultado: dict[str, Any]) -> None:
    envio.resultado = resultado
    envio.veredicto = resultado.get("veredicto")
    puntaje = resultado.get("puntaje") or {}
    envio.puntaje = puntaje.get("total") if isinstance(puntaje, dict) else None
    envio.correcto = resultado.get("veredicto") == "aceptado"
    rendimiento = resultado.get("rendimiento") or {}
    if rendimiento.get("medido"):
        envio.aceleracion = rendimiento.get("aceleracion_max")
        envio.eficiencia = rendimiento.get("eficiencia_pmax")


def registrar_evento(db: Session, usuario_id: int, tipo: str, laboratorio_id: int | None = None,
                     curso_id: int | None = None, datos: dict[str, Any] | None = None) -> None:
    db.add(Evento(usuario_id=usuario_id, tipo=tipo, laboratorio_id=laboratorio_id, curso_id=curso_id, datos=datos or {}))
