# Manual de uso

## Estudiantes

**Crear la cuenta.** En la pantalla de ingreso, pulse *Crea tu cuenta de estudiante*. Escriba su nombre, su correo institucional, una contraseña de al menos 8 caracteres y el código del curso que le dio su docente. Aceptar el tratamiento de datos es obligatorio. Autorizar el uso de sus datos en la investigación es opcional: se puede cambiar después en *Mi perfil* y no afecta las calificaciones.

**Resolver un laboratorio.** En *Inicio* aparece el siguiente laboratorio pendiente. La pantalla de trabajo tiene dos partes:

- A la izquierda, el **enunciado**, con los objetivos, el problema, el formato de entrada y salida, y el recuadro *Cómo se evalúa*. Las pestañas *Ejemplos*, *Preguntas* (repaso que no da puntos) e *Historial* completan la información. Las pistas se descubren una a una al final del enunciado.
- A la derecha, el **editor**. Las directivas de OpenMP se ven en azul, las llamadas MPI en naranja y las extensiones de CUDA en violeta. El código se guarda solo mientras escribe, así que puede seguir desde otro computador.

**Ejecutar** (Ctrl + Enter) compila y corre el programa una vez con la entrada de la consola y el número de hilos o procesos elegido arriba. Si la entrada es la de un caso de ejemplo, se compara la salida con la esperada. Úselo para probar con 1 y con varios hilos antes de enviar.

**Enviar a evaluación** (Ctrl + Mayús + Enter) ejecuta todos los casos, incluidos los ocultos, con varios valores de *p*. Si todo es correcto, mide la aceleración. El resultado muestra:

- el veredicto y el puntaje, separado en corrección y rendimiento;
- la retroalimentación, ordenada de los errores a los logros. *Ir a la línea* lleva el cursor al lugar del error;
- la **matriz de casos de prueba**: cada cuadro es una ejecución con un valor de *p*. Si los casos pasan con *p* = 1 y fallan con *p* = 4, el problema casi siempre es una condición de carrera;
- la **gráfica de aceleración**, frente a la ideal (*S* = *p*) y al objetivo de eficiencia, con la tabla de tiempos y la fracción serial estimada.

El *Historial* guarda todos los envíos: puede ver cualquier resultado o cargar ese código de nuevo en el editor.

**Simulador.** Explore cómo la fracción serial limita la aceleración según las leyes de Amdahl y Gustafson, y estime la fracción serial de su propio programa a partir de una medición.

## Docentes

1. **Crear un curso** en *Inicio* y compartir su código de inscripción, que puede copiar o regenerar en la pestaña *Estudiantes*.
2. **Asignar laboratorios** en la pestaña *Laboratorios*. Elija varios del banco a la vez y, si quiere, fije una fecha límite (informativa: los envíos tardíos se aceptan y se marcan) y un máximo de intentos.
3. **Seguir el progreso.** La pestaña *Progreso* muestra una matriz de estudiantes por laboratorios con el mejor puntaje. Al pulsar una celda se ven los envíos, y desde ahí el código y el resultado de cada uno.
4. **Analítica.** Actividad diaria, resultados, distribución de puntajes, dificultades más frecuentes (útil para decidir qué reforzar en clase) y, por laboratorio, aceptación, puntaje medio, aceleración mediana, y minutos y envíos hasta el primer aceptado.
5. **Encuesta SUS.** Actívela al final de la intervención. El panel calcula la media, la desviación estándar, el intervalo de confianza del 95 % y la prueba t contra 70 (hipótesis H2), con la *d* de Cohen.
6. **Datos para investigación.** Descargue los CSV de envíos, progreso, eventos y encuesta. Incluyen solo a quienes autorizaron el uso de sus datos, identificados con un seudónimo.
7. **Banco de laboratorios.** Pruebe cualquier laboratorio con *Probar*: puede cargar la solución del docente y sus envíos no cuentan en la analítica. Para adaptar uno del banco, use *Duplicar*. Para crear laboratorios nuevos, siga la [guía para crear laboratorios](guia-laboratorios.md).

## Administradores

- **Sistema > Recursos de cómputo** muestra los trabajadores en línea, sus núcleos y modelos disponibles, la cola, y los tiempos medios de espera y de proceso. Se actualiza cada 5 segundos. Si un envío queda con error interno, por ejemplo tras reiniciar un nodo, se puede devolver a la cola con su número.
- **Sistema > Usuarios** permite crear cuentas, cambiar roles, desactivar cuentas y asignar contraseñas nuevas.
- Las tareas de instalación, copias de seguridad y actualización están en el [README de LabPar](../../labpar/README.md).
