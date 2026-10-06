"""Utilidades de análisis léxico ligero sobre código C/C++/CUDA."""
from __future__ import annotations


def limpiar_codigo(codigo: str, quitar_cadenas: bool = True) -> str:
    """Reemplaza comentarios (y, opcionalmente, el contenido de cadenas) por espacios.

    Conserva los saltos de línea para que las posiciones sigan correspondiendo a las líneas originales.
    """
    salida: list[str] = []
    i, n = 0, len(codigo)
    estado: str | None = None
    while i < n:
        c = codigo[i]
        sig = codigo[i + 1] if i + 1 < n else ""
        if estado is None:
            if c == "/" and sig == "/":
                estado = "linea"
                salida.append("  ")
                i += 2
                continue
            if c == "/" and sig == "*":
                estado = "bloque"
                salida.append("  ")
                i += 2
                continue
            if c == '"':
                estado = "cadena"
            elif c == "'":
                estado = "caracter"
            salida.append(c)
            i += 1
            continue
        if estado == "linea":
            if c == "\n":
                estado = None
                salida.append("\n")
            else:
                salida.append(" ")
            i += 1
            continue
        if estado == "bloque":
            if c == "*" and sig == "/":
                estado = None
                salida.append("  ")
                i += 2
                continue
            salida.append("\n" if c == "\n" else " ")
            i += 1
            continue
        # Dentro de una cadena o de un literal de carácter
        if c == "\\" and i + 1 < n:
            salida.append("  " if quitar_cadenas else c + codigo[i + 1])
            i += 2
            continue
        if (estado == "cadena" and c == '"') or (estado == "caracter" and c == "'"):
            estado = None
            salida.append(c)
            i += 1
            continue
        if c == "\n":  # literal sin cerrar: se recupera al final de la línea
            estado = None
            salida.append(c)
            i += 1
            continue
        salida.append(" " if quitar_cadenas else c)
        i += 1
    return "".join(salida)


def linea_de(texto: str, posicion: int) -> int:
    return texto.count("\n", 0, posicion) + 1


def bloque_balanceado(texto: str, inicio: int) -> tuple[int, int] | None:
    """Devuelve (inicio, fin) del cuerpo del bucle o sentencia que empieza en `inicio`.

    Busca la primera llave de apertura y su cierre correspondiente; si la sentencia no usa
    llaves, devuelve hasta el siguiente punto y coma de nivel superior.
    """
    n = len(texto)
    i = inicio
    parentesis = 0
    # Saltar la cabecera del for (...) si existe
    while i < n and texto[i].isspace():
        i += 1
    if texto.startswith("for", i):
        j = texto.find("(", i)
        if j == -1:
            return None
        parentesis = 0
        k = j
        while k < n:
            if texto[k] == "(":
                parentesis += 1
            elif texto[k] == ")":
                parentesis -= 1
                if parentesis == 0:
                    break
            k += 1
        i = k + 1
    while i < n and texto[i].isspace():
        i += 1
    if i < n and texto[i] == "{":
        profundidad = 0
        k = i
        while k < n:
            if texto[k] == "{":
                profundidad += 1
            elif texto[k] == "}":
                profundidad -= 1
                if profundidad == 0:
                    return i, k + 1
            k += 1
        return i, n
    # Sentencia simple (o bucle anidado sin llaves)
    if texto.startswith("for", i):
        interno = bloque_balanceado(texto, i)
        return (i, interno[1]) if interno else None
    k = texto.find(";", i)
    return (i, k + 1) if k != -1 else None
