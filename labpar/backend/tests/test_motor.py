"""Pruebas unitarias del motor de evaluación y del banco de laboratorios."""
from __future__ import annotations

import os
import shutil
import tempfile

import pytest

from labpar.banco import cargar_banco, cargar_laboratorio, DIRECTORIO_BANCO
from labpar.motor import puntaje
from labpar.motor.capacidades import detectar
from labpar.motor.codigo import limpiar_codigo
from labpar.motor.comparacion import comparar
from labpar.motor.compilacion import analizar_diagnosticos, explicar
from labpar.motor.evaluador import Contexto, Trabajo, procesar
from labpar.motor.heuristicas import heuristicas_cuda, heuristicas_mpi, heuristicas_openmp, verificar_requisitos


def test_limpiar_codigo_conserva_lineas():
    codigo = 'int a; // MPI_Send\n/* MPI_Reduce\n */ printf("MPI_Bcast"); char c = \'"\';\n'
    limpio = limpiar_codigo(codigo)
    assert "MPI" not in limpio and limpio.count("\n") == codigo.count("\n")
    assert "MPI_Bcast" in limpiar_codigo(codigo, quitar_cadenas=False)


def test_comparacion():
    assert comparar("5563\n", "5563", "exacta").ok
    assert not comparar("1\n2\n", "1\n3\n", "exacta").ok
    assert comparar("1 2\n3", "1\n2 3\n\n", "tokens").ok
    r = comparar("3.141592653590", "3.141592653589", "numerica", 1e-9)
    assert r.ok
    r = comparar("3.141592653590", "3.15", "numerica", 1e-9)
    assert not r.ok and r.linea == 1 and r.esperado == "3.141592653590"
    r = comparar("1 2", "1", "tokens")
    assert not r.ok and "incompleta" in r.detalle


def test_heuristicas_openmp():
    carrera = "#include <omp.h>\nint main(){long s=0;\n#pragma omp parallel for\nfor(int i=0;i<10;i++){ s += i; }\nreturn 0;}"
    codigos = {r.codigo for r in heuristicas_openmp(carrera)}
    assert "OMP_CARRERA_ESTATICA" in codigos
    bien = carrera.replace("parallel for", "parallel for reduction(+:s)")
    assert "OMP_CARRERA_ESTATICA" not in {r.codigo for r in heuristicas_openmp(bien)}
    privada = "#include <omp.h>\nint main(){double x,s=0;\n#pragma omp parallel for private(x) reduction(+:s)\nfor(int i=0;i<9;i++){ x=i; s = s + x; }}"
    assert not [r for r in heuristicas_openmp(privada) if r.codigo == "OMP_CARRERA_ESTATICA"]
    critica = "#include <omp.h>\nint main(){long s=0;\n#pragma omp parallel for\nfor(int i=0;i<10;i++){\n#pragma omp critical\n s += i; }}"
    assert "OMP_CRITICA_EN_BUCLE" in {r.codigo for r in heuristicas_openmp(critica)}
    sin_include = "int main(){double t = omp_get_wtime(); return 0;}"
    assert {"OMP_SIN_INCLUDE", "OMP_SIN_DIRECTIVAS"} <= {r.codigo for r in heuristicas_openmp(sin_include)}
    fijo = "#include <omp.h>\nint main(){ omp_set_num_threads(4);\n#pragma omp parallel\n{} }"
    assert "OMP_HILOS_FIJOS" in {r.codigo for r in heuristicas_openmp(fijo)}


def test_heuristicas_mpi_y_cuda():
    todos = "#include <mpi.h>\nint main(int c,char**v){int r; MPI_Init(&c,&v); MPI_Comm_rank(MPI_COMM_WORLD,&r); printf(\"x\"); return 0;}"
    codigos = {r.codigo for r in heuristicas_mpi(todos)}
    assert {"MPI_IMPRESION_TODOS", "MPI_SIN_FINALIZE"} <= codigos
    protegido = todos.replace('printf("x");', 'if (r == 0) printf("x"); MPI_Finalize();')
    assert not {"MPI_IMPRESION_TODOS", "MPI_SIN_FINALIZE"} & {r.codigo for r in heuristicas_mpi(protegido)}
    kernel = "__global__ void k(int *a){ a[threadIdx.x] = 1; }\nint main(){ k<<<1,32>>>(0); return 0; }"
    codigos = {r.codigo for r in heuristicas_cuda(kernel)}
    assert {"CUDA_SIN_LIMITE", "CUDA_SIN_SINCRONIZAR", "CUDA_SIN_VERIFICAR_ERRORES"} <= codigos


def test_requisitos_ignoran_comentarios():
    estado, retro = verificar_requisitos("// MPI_Send\nint main(){}", [{"patron": r"\bMPI_Send\s*\(", "mensaje": "usa MPI_Send"}],
                                         [{"patron": r"\bMPI_Reduce\s*\(", "mensaje": "sin reduce"}])
    assert estado[0]["cumplido"] is False and estado[1]["cumplido"] is True and retro[0].codigo == "REQUISITO"


def test_diagnosticos_del_compilador():
    salida = ("programa.c:12:5: error: ‘suma’ undeclared (first use in this function)\n"
              "programa.c:20:1: warning: unused variable ‘x’ [-Wunused-variable]\n"
              "programa.c:(.text+0x1e): undefined reference to `foo'\n")
    diags = analizar_diagnosticos(salida)
    assert diags[0]["linea"] == 12 and "suma" in diags[0]["explicacion"]
    assert any(d["tipo"] == "advertencia" and d["linea"] == 20 for d in diags)
    assert any(d["linea"] is None and "foo" in (d["explicacion"] or "") for d in diags)
    assert "omp.h" in explicar("implicit declaration of function ‘omp_get_thread_num’")
    assert "punto y coma" in explicar("expected ‘,’ or ‘;’ before ‘for’")


def test_puntaje():
    cfg = {"peso_correccion": 70, "peso_rendimiento": 30}
    assert puntaje.calcular(1.0, {"evaluable": True, "medido": True, "fraccion_objetivo": 1.0}, cfg, True)["total"] == 100.0
    assert puntaje.calcular(1.0, {"evaluable": True, "medido": True, "fraccion_objetivo": 0.5}, cfg, True)["total"] == 85.0
    assert puntaje.calcular(0.5, {"evaluable": True, "medido": False}, cfg, True)["total"] == 35.0
    assert puntaje.calcular(1.0, {"evaluable": False, "motivo": "1 núcleo"}, cfg, True)["total"] == 100.0
    assert puntaje.calcular(1.0, {"evaluable": True, "medido": True, "fraccion_objetivo": 1.0}, cfg, False)["total"] == 50.0
    assert puntaje.fraccion_objetivo(2.0, 3.0) == 0.5 and puntaje.fraccion_objetivo(0.5, 2.0) == 0.0


def test_banco_completo():
    labs = cargar_banco()
    assert len(labs) == 9
    for lab in labs:
        assert lab["plantilla"] and lab["solucion_referencia"] and lab["solucion_docente"] and lab["enunciado_md"]
        assert lab["casos"] and all(c["salida_esperada"].strip() for c in lab["casos"]), lab["slug"]
        assert any(c["visible"] for c in lab["casos"])
        assert lab["config"].get("entrada_rendimiento")
        for pregunta in lab["preguntas"]:
            assert 0 <= pregunta["correcta"] < len(pregunta["opciones"])


@pytest.fixture()
def contexto():
    base = tempfile.mkdtemp(prefix="labpar_motor_")
    os.chmod(base, 0o755)
    uid = int(os.environ["LABPAR_UID_SANDBOX"]) if os.environ.get("LABPAR_UID_SANDBOX") else None
    yield Contexto(directorio_trabajos=os.path.join(base, "t"), directorio_cache=os.path.join(base, "c"), uid=uid, gid=uid)
    shutil.rmtree(base, ignore_errors=True)


def _trabajo(slug: str, codigo: str, **kw) -> Trabajo:
    lab = cargar_laboratorio(DIRECTORIO_BANCO / slug)
    return Trabajo(tipo=kw.pop("tipo", "evaluacion"), modelo=lab["modelo"], lenguaje=lab["lenguaje"], codigo=codigo,
                   config=lab["config"], casos=lab["casos"], referencia=lab["solucion_referencia"], **kw)


def test_motor_errores_de_compilacion_y_ejecucion(contexto):
    plantilla = (DIRECTORIO_BANCO / "omp-02-pi-integracion" / "plantilla.c").read_text()
    r = procesar(_trabajo("omp-02-pi-integracion", plantilla.replace("double h = 1.0 / (double)n;", "double h = 1.0 / (double)n")), contexto)
    assert r["veredicto"] == "error_compilacion" and r["retroalimentacion"][0]["codigo"] == "COMPILACION"
    r = procesar(_trabajo("omp-02-pi-integracion", plantilla.replace('printf("%.12f\\n", pi);', 'int *q = 0; *q = 3;')), contexto)
    assert r["veredicto"] == "error_ejecucion"
    assert any(x["codigo"] == "SEGFAULT" for x in r["retroalimentacion"])
    r = procesar(_trabajo("omp-02-pi-integracion", plantilla.replace("for (long long i = 0; i < n; i++)", "for (long long i = 0; i < n; i += 0)")), contexto)
    assert r["veredicto"] == "tiempo_excedido"


@pytest.mark.skipif(not detectar()["mpi"]["disponible"], reason="MPI no disponible")
def test_motor_detecta_interbloqueo_mpi(contexto):
    solucion = (DIRECTORIO_BANCO / "mpi-01-suma-anillo" / "solucion.c").read_text()
    bloqueo = solucion.replace(
        "        if (rango > 0) {\n            MPI_Recv(&recibido, 1, MPI_LONG_LONG, rango - 1, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);\n"
        "            acumulado += recibido;\n        }",
        "        MPI_Recv(&recibido, 1, MPI_LONG_LONG, (rango + p - 1) % p, 0, MPI_COMM_WORLD, MPI_STATUS_IGNORE);\n"
        "        if (rango > 0) acumulado += recibido;")
    assert bloqueo != solucion
    r = procesar(_trabajo("mpi-01-suma-anillo", bloqueo), contexto)
    assert r["veredicto"] == "tiempo_excedido"
    assert any(x["codigo"] == "INTERBLOQUEO" for x in r["retroalimentacion"])
    assert r["duracion_s"] < 60  # falla rápida: no se agota el tiempo en cada caso


def test_cuda_no_disponible_se_reporta(contexto):
    if detectar()["cuda"]["disponible"]:
        pytest.skip("Este nodo tiene GPU")
    plantilla = (DIRECTORIO_BANCO / "cuda-01-suma-vectores" / "plantilla.cu").read_text()
    r = procesar(_trabajo("cuda-01-suma-vectores", plantilla), contexto)
    assert r["veredicto"] == "no_disponible"
    assert r["retroalimentacion"][-1]["codigo"] == "MODELO_NO_DISPONIBLE"
