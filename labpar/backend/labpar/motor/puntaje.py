"""Cálculo del puntaje: corrección (casos de prueba) y rendimiento (aceleración frente a la referencia)."""
from __future__ import annotations


def fraccion_objetivo(aceleracion: float, objetivo: float) -> float:
    """Proporción del objetivo de aceleración alcanzada, interpolando linealmente desde S = 1."""
    if objetivo <= 1.0:
        return 1.0 if aceleracion >= 1.0 else max(0.0, aceleracion)
    return max(0.0, min(1.0, (aceleracion - 1.0) / (objetivo - 1.0)))


def calcular(proporcion_correccion: float, rendimiento: dict | None, cfg: dict, requisitos_ok: bool) -> dict:
    pc = float(cfg.get("peso_correccion", 70))
    pr = float(cfg.get("peso_rendimiento", 30))
    evaluable = bool(rendimiento and rendimiento.get("evaluable")) and pr > 0
    nota = None
    if not evaluable:
        correccion = proporcion_correccion * 100.0
        parte_rendimiento = 0.0
        if pr > 0:
            nota = (rendimiento or {}).get("motivo") or "El rendimiento no se evaluó; el puntaje se basa en la corrección."
    else:
        fraccion = 0.0
        if proporcion_correccion >= 1.0 and rendimiento.get("medido"):
            fraccion = float(rendimiento.get("fraccion_objetivo") or 0.0)
        correccion = pc * proporcion_correccion / (pc + pr) * 100.0
        parte_rendimiento = pr * fraccion / (pc + pr) * 100.0
    total = correccion + parte_rendimiento
    if not requisitos_ok:
        total = min(total, 50.0)
        nota = "El código no cumple los requisitos del laboratorio: el puntaje máximo es 50."
    return {
        "correccion": round(correccion, 1),
        "rendimiento": round(parte_rendimiento, 1),
        "total": round(total, 1),
        "peso_correccion": pc,
        "peso_rendimiento": pr,
        "rendimiento_evaluable": evaluable,
        "nota": nota,
    }
