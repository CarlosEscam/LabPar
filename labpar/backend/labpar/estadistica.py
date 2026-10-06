"""Estadística descriptiva e inferencial mínima (sin dependencias externas).

Se usa para el tablero docente: resumen de la escala SUS, intervalo de confianza de la media y prueba t
de una muestra frente al valor de referencia de la hipótesis H2 del proyecto (SUS > 70).
"""
from __future__ import annotations

import math
from statistics import mean, median, stdev


def _fraccion_continua_beta(a: float, b: float, x: float) -> float:
    """Fracción continua de la función beta incompleta (método de Lentz, Numerical Recipes §6.4)."""
    maximo, eps, minimo = 300, 3e-14, 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > minimo else minimo)
    h = d
    for m in range(1, maximo + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > minimo else minimo)
        c = 1.0 + aa / (c if abs(c) > minimo else minimo)
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > minimo else minimo)
        c = 1.0 + aa / (c if abs(c) > minimo else minimo)
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def beta_incompleta_regularizada(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    ln_bt = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log1p(-x)
    bt = math.exp(ln_bt)
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _fraccion_continua_beta(a, b, x) / a
    return 1.0 - bt * _fraccion_continua_beta(b, a, 1.0 - x) / b


def t_cdf(t: float, gl: float) -> float:
    """Función de distribución acumulada de la t de Student."""
    x = gl / (gl + t * t)
    cola = 0.5 * beta_incompleta_regularizada(gl / 2.0, 0.5, x)
    return 1.0 - cola if t >= 0 else cola


def t_cuantil(p: float, gl: float) -> float:
    """Cuantil de la t de Student por bisección (suficiente para intervalos de confianza)."""
    bajo, alto = -1000.0, 1000.0
    for _ in range(200):
        medio = (bajo + alto) / 2.0
        if t_cdf(medio, gl) < p:
            bajo = medio
        else:
            alto = medio
    return (bajo + alto) / 2.0


def resumen(valores: list[float]) -> dict:
    n = len(valores)
    if n == 0:
        return {"n": 0, "media": None, "de": None, "mediana": None, "minimo": None, "maximo": None, "ic95": None}
    media = mean(valores)
    de = stdev(valores) if n > 1 else 0.0
    ic = None
    if n > 1:
        margen = t_cuantil(0.975, n - 1) * de / math.sqrt(n)
        ic = [round(media - margen, 2), round(media + margen, 2)]
    return {"n": n, "media": round(media, 2), "de": round(de, 2), "mediana": round(median(valores), 2),
            "minimo": round(min(valores), 2), "maximo": round(max(valores), 2), "ic95": ic}


def prueba_t_una_muestra(valores: list[float], mu0: float, alternativa: str = "mayor") -> dict | None:
    """Prueba t de una muestra. alternativa: 'mayor' (H1: μ > μ0), 'menor' o 'distinta'."""
    n = len(valores)
    if n < 2:
        return None
    media = mean(valores)
    de = stdev(valores)
    if de == 0:
        return {"t": None, "gl": n - 1, "p": None, "mu0": mu0, "alternativa": alternativa,
                "nota": "Todas las respuestas tienen el mismo puntaje; la prueba no es aplicable."}
    t = (media - mu0) / (de / math.sqrt(n))
    gl = n - 1
    if alternativa == "mayor":
        p = 1.0 - t_cdf(t, gl)
    elif alternativa == "menor":
        p = t_cdf(t, gl)
    else:
        p = 2.0 * (1.0 - t_cdf(abs(t), gl))
    # d de Cohen para una muestra: tamaño del efecto frente al valor de referencia (útil con muestras pequeñas).
    return {"t": round(t, 3), "gl": gl, "p": round(p, 4), "mu0": mu0, "alternativa": alternativa,
            "d": round((media - mu0) / de, 3), "significativa": p < 0.05}


def puntaje_sus(respuestas: list[int]) -> float:
    """Puntaje SUS (Brooke, 1996): ítems impares aportan x − 1, pares 5 − x; la suma se multiplica por 2,5."""
    total = sum((x - 1) if i % 2 == 0 else (5 - x) for i, x in enumerate(respuestas))
    return total * 2.5
