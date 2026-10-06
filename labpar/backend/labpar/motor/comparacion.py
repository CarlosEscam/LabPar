"""Comparación de la salida obtenida con la esperada (exacta, por tokens o numérica con tolerancia)."""
from __future__ import annotations

import math
from dataclasses import dataclass

MODOS = ("exacta", "tokens", "numerica")


@dataclass
class Comparacion:
    ok: bool
    detalle: str | None = None
    linea: int | None = None
    esperado: str | None = None
    obtenido: str | None = None

    def como_dict(self) -> dict:
        return {"ok": self.ok, "detalle": self.detalle, "linea": self.linea, "esperado": self.esperado, "obtenido": self.obtenido}


def _normalizar(texto: str) -> str:
    lineas = texto.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return "\n".join(l.rstrip() for l in lineas).strip("\n")


def _tokens(texto: str) -> list[tuple[str, int]]:
    resultado: list[tuple[str, int]] = []
    for numero, linea in enumerate(texto.replace("\r\n", "\n").split("\n"), start=1):
        resultado.extend((tok, numero) for tok in linea.split())
    return resultado


def _numero(token: str) -> float | None:
    try:
        valor = float(token.replace(",", ".")) if token.count(",") == 1 and "." not in token else float(token)
    except ValueError:
        return None
    return valor if math.isfinite(valor) else None


def comparar(esperada: str, obtenida: str, modo: str = "tokens", tol_rel: float = 1e-9, tol_abs: float = 1e-12) -> Comparacion:
    if modo == "exacta":
        a, b = _normalizar(esperada), _normalizar(obtenida)
        if a == b:
            return Comparacion(True)
        la, lb = a.split("\n"), b.split("\n")
        for i in range(max(len(la), len(lb))):
            ea = la[i] if i < len(la) else "(fin de la salida)"
            eb = lb[i] if i < len(lb) else "(fin de la salida)"
            if ea != eb:
                return Comparacion(False, "La línea difiere de la esperada.", i + 1, ea, eb)
        return Comparacion(False, "La salida difiere de la esperada.")

    te, to = _tokens(esperada), _tokens(obtenida)
    for i in range(max(len(te), len(to))):
        if i >= len(to):
            tok, linea = te[i]
            return Comparacion(False, "La salida está incompleta: faltan valores.", linea, tok, "(fin de la salida)")
        if i >= len(te):
            tok, linea = to[i]
            return Comparacion(False, "La salida tiene valores de más.", linea, "(fin de la salida)", tok)
        (ea, linea), (eb, _) = te[i], to[i]
        if ea == eb:
            continue
        if modo == "numerica":
            va, vb = _numero(ea), _numero(eb)
            if va is not None and vb is not None:
                if abs(va - vb) <= max(tol_abs, tol_rel * max(abs(va), abs(vb))):
                    continue
                return Comparacion(
                    False,
                    f"El valor numérico difiere más de la tolerancia (relativa {tol_rel:g}, absoluta {tol_abs:g}).",
                    linea,
                    ea,
                    eb,
                )
        return Comparacion(False, "Un valor de la salida no coincide con el esperado.", linea, ea, eb)
    return Comparacion(True)
