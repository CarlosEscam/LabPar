## Contexto

La integración numérica es un ejemplo clásico de cómputo paralelo: el intervalo se divide en $n$
subintervalos independientes y cada hilo puede evaluar una parte de ellos. Como

$$\pi = \int_0^1 \frac{4}{1 + x^2}\,dx,$$

aproximar la integral con la regla del punto medio permite calcular $\pi$ con tanta precisión como se quiera.

## Problema

Con $h = 1/n$ y $x_i = (i + 0.5)\,h$, calcula

$$\pi \approx h \sum_{i=0}^{n-1} \frac{4}{1 + x_i^2}.$$

## Entrada

Una línea con el entero $n$ ($1 \le n \le 10^9$).

## Salida

El valor aproximado de $\pi$ con 12 decimales (`%.12f`).

## Ejemplo

| Entrada | Salida |
|---|---|
| `4` | `3.146800518394` |

## Qué debes hacer

1. Paraleliza el bucle con OpenMP.
2. En la plantilla, `x` está declarada **fuera** del `for`: decide qué alcance debe tener (y lo mismo para `suma`).
3. Compara el resultado con 1 y con varios hilos usando **Ejecutar**.

## Sobre la precisión

La suma en coma flotante **no es asociativa**: al repartir los términos entre hilos, el orden de las sumas
cambia y el último decimal puede variar. Por eso este laboratorio compara las salidas con una tolerancia
relativa de $10^{-9}$: una diferencia en el duodécimo decimal es correcta; una diferencia en el tercero
indica un error.

## Para reflexionar

- ¿Qué pasa si `x` queda compartida? ¿Por qué el error no siempre aparece?
- Si el 95 % del tiempo de un programa es paralelizable, ¿cuál es la máxima aceleración que predice la ley de Amdahl?
