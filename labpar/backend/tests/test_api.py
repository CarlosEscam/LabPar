"""Pruebas de la API: autenticación, cursos, laboratorios, envíos, analítica y encuesta SUS."""
from __future__ import annotations

from pathlib import Path

from conftest import procesar_cola

BANCO = Path(__file__).resolve().parent.parent / "labpar" / "banco"


def _lab_id(cliente, cabecera, slug: str) -> int:
    labs = cliente.get("/api/laboratorios", headers=cabecera).json()
    return next(l["id"] for l in labs if l["slug"] == slug)


def test_salud_y_config(cliente):
    assert cliente.get("/api/salud").json()["estado"] == "ok"
    cfg = cliente.get("/api/auth/config-publica").json()
    assert cfg["demo"] is True and len(cfg["cuentas_demo"]) == 3


def test_registro_ingreso_y_errores(cliente):
    datos = {"nombre": "Ana  Pérez", "email": "Ana@Ejemplo.edu.co", "clave": "clave-segura-1", "acepta_terminos": True,
             "consentimiento_investigacion": True, "codigo_inscripcion": "ppd262"}
    r = cliente.post("/api/auth/registro", json=datos)
    assert r.status_code == 201, r.text
    usuario = r.json()["usuario"]
    assert usuario["email"] == "ana@ejemplo.edu.co" and usuario["nombre"] == "Ana Pérez" and usuario["rol"] == "estudiante"
    assert cliente.post("/api/auth/registro", json=datos).status_code == 409
    assert cliente.post("/api/auth/registro", json={**datos, "email": "x@y.co", "acepta_terminos": False}).status_code == 422
    assert cliente.post("/api/auth/registro", json={**datos, "email": "z@y.co", "codigo_inscripcion": "NOEXIS"}).status_code == 404
    assert cliente.post("/api/auth/ingresar", json={"email": "ana@ejemplo.edu.co", "clave": "mala"}).status_code == 401
    token = cliente.post("/api/auth/ingresar", json={"email": "ANA@ejemplo.edu.co", "clave": "clave-segura-1"}).json()["token"]
    yo = cliente.get("/api/auth/yo", headers={"Authorization": f"Bearer {token}"}).json()
    assert yo["consentimiento_investigacion"] is True
    cursos = cliente.get("/api/cursos", headers={"Authorization": f"Bearer {token}"}).json()
    assert [c["nombre"] for c in cursos] == ["Programación Paralela y Distribuida"]
    assert cursos[0]["codigo_inscripcion"] is None  # el estudiante no ve el código del curso
    assert cliente.get("/api/auth/yo").status_code == 401
    assert cliente.get("/api/auth/yo", headers={"Authorization": "Bearer basura"}).status_code == 401


def test_permisos_y_laboratorio_del_estudiante(cliente, estudiante, docente):
    assert cliente.post("/api/cursos", json={"nombre": "Curso X"}, headers=estudiante).status_code == 403
    labs = cliente.get("/api/laboratorios", headers=estudiante).json()
    assert len(labs) == 9 and {l["modelo"] for l in labs} == {"openmp", "mpi", "cuda"}
    lab_id = _lab_id(cliente, estudiante, "omp-01-suma-reduccion")
    lab = cliente.get(f"/api/laboratorios/{lab_id}", headers=estudiante).json()
    assert "solucion_referencia" not in lab and "solucion_docente" not in lab and "casos" not in lab
    assert lab["casos_visibles"] and all(c["salida_esperada"] for c in lab["casos_visibles"])
    assert lab["evaluacion"]["num_casos_ocultos"] == 3 and lab["evaluacion"]["requisitos"]
    lab_doc = cliente.get(f"/api/laboratorios/{lab_id}", headers=docente).json()
    assert lab_doc["solucion_docente"] and len(lab_doc["casos"]) == 5


def test_curso_nuevo_inscripcion_y_asignacion(cliente, docente):
    curso = cliente.post("/api/cursos", json={"nombre": "Paralela grupo B", "periodo": "2026-2"}, headers=docente).json()
    assert len(curso["codigo_inscripcion"]) == 6
    r = cliente.post("/api/auth/registro", json={"nombre": "Beto", "email": "beto@x.co", "clave": "12345678", "acepta_terminos": True})
    beto = {"Authorization": f"Bearer {r.json()['token']}"}
    assert cliente.get("/api/laboratorios", headers=beto).json() == []
    lab_id = _lab_id(cliente, docente, "omp-02-pi-integracion")
    assert cliente.get(f"/api/laboratorios/{lab_id}", headers=beto).status_code == 403
    assert cliente.post("/api/cursos/inscribirse", json={"codigo": curso["codigo_inscripcion"].lower()}, headers=beto).status_code == 200
    assert cliente.post(f"/api/cursos/{curso['id']}/asignaciones", json={"laboratorio_id": lab_id}, headers=docente).status_code == 201
    assert cliente.post(f"/api/cursos/{curso['id']}/asignaciones", json={"laboratorio_id": lab_id}, headers=docente).status_code == 409
    asignaciones = cliente.get(f"/api/cursos/{curso['id']}/asignaciones", headers=beto).json()
    assert asignaciones[0]["estado"] == "sin_intentos"
    assert cliente.get(f"/api/laboratorios/{lab_id}", headers=beto).status_code == 200
    estudiantes = cliente.get(f"/api/cursos/{curso['id']}/estudiantes", headers=docente).json()
    assert [e["nombre"] for e in estudiantes] == ["Beto"]
    assert cliente.get(f"/api/cursos/{curso['id']}/estudiantes", headers=beto).status_code == 403


def test_flujo_de_envio_completo(cliente, estudiante, docente):
    lab_id = _lab_id(cliente, estudiante, "omp-01-suma-reduccion")
    cursos = cliente.get("/api/cursos", headers=estudiante).json()
    curso_id = cursos[0]["id"]
    cliente.post("/api/eventos", json={"tipo": "lab_abierto", "laboratorio_id": lab_id, "curso_id": curso_id}, headers=estudiante)
    solucion = (BANCO / "omp-01-suma-reduccion" / "solucion.c").read_text()
    plantilla = (BANCO / "omp-01-suma-reduccion" / "plantilla.c").read_text()
    carrera = plantilla.replace("/* TODO: paraleliza este bucle con OpenMP y evita la condición de carrera sobre «suma». */",
                                "#pragma omp parallel for")

    r1 = cliente.post("/api/envios", json={"laboratorio_id": lab_id, "codigo": carrera}, headers=estudiante)
    r2 = cliente.post("/api/envios", json={"laboratorio_id": lab_id, "codigo": solucion}, headers=estudiante)
    r3 = cliente.post("/api/envios", json={"laboratorio_id": lab_id, "codigo": solucion, "tipo": "ejecucion", "hilos": 2,
                                           "entrada": "10 1\n"}, headers=estudiante)
    assert r1.status_code == r2.status_code == r3.status_code == 202
    assert r3.json()["posicion_cola"] == 1  # la ejecución rápida tiene prioridad
    assert procesar_cola() == 3

    rapido = cliente.get(f"/api/envios/{r3.json()['id']}", headers=estudiante).json()
    assert rapido["estado"] == "completado" and rapido["resultado"]["stdout"].strip() == "5563"
    assert rapido["resultado"]["comparacion_ejemplo"]["ok"] is True

    malo = cliente.get(f"/api/envios/{r1.json()['id']}", headers=estudiante).json()
    assert malo["veredicto"] == "respuesta_incorrecta" and not malo["correcto"]
    codigos = {x["codigo"] for x in malo["resultado"]["retroalimentacion"]}
    assert {"CARRERA_PROBABLE", "OMP_CARRERA_ESTATICA"} <= codigos
    ocultos = [c for c in malo["resultado"]["correccion"]["casos"] if not c["visible"]]
    assert ocultos and all(c["entrada"] is None and c["esperada"] is None for c in ocultos)

    bueno = cliente.get(f"/api/envios/{r2.json()['id']}", headers=estudiante).json()
    assert bueno["veredicto"] == "aceptado" and bueno["correcto"] and bueno["puntaje"] > 70
    rend = bueno["resultado"]["rendimiento"]
    assert rend["medido"] and rend["puntos"][0]["p"] == 1 and rend["fuente_tiempo"] == "interno"

    # El docente sí ve las entradas de los casos ocultos
    malo_docente = cliente.get(f"/api/envios/{r1.json()['id']}", headers=docente).json()
    assert all(c["entrada"] is not None for c in malo_docente["resultado"]["correccion"]["casos"])

    historial = cliente.get(f"/api/envios?laboratorio_id={lab_id}", headers=estudiante).json()
    assert [h["tipo"] for h in historial] == ["evaluacion", "evaluacion"]
    asignaciones = cliente.get(f"/api/cursos/{curso_id}/asignaciones", headers=estudiante).json()
    omp1 = next(a for a in asignaciones if a["laboratorio"]["id"] == lab_id)
    assert omp1["estado"] == "aceptado" and omp1["intentos"] == 2


def test_analitica_exportacion_y_sus(cliente, estudiante, docente):
    curso_id = cliente.get("/api/cursos", headers=docente).json()[-1]["id"]
    progreso = cliente.get(f"/api/cursos/{curso_id}/progreso", headers=docente).json()
    celda = next(c for c in progreso["celdas"] if c["aceptado"])
    assert celda["envios_hasta_aceptado"] == 2 and celda["minutos_hasta_aceptado"] is not None
    assert cliente.get(f"/api/cursos/{curso_id}/progreso", headers=estudiante).status_code == 403

    estado = cliente.get(f"/api/sus/{curso_id}", headers=estudiante).json()
    assert estado == {"activa": True, "respondida": False, "puntaje": None}
    r = cliente.post(f"/api/sus/{curso_id}", json={"respuestas": [5, 1, 4, 2, 5, 1, 4, 2, 5, 1]}, headers=estudiante)
    assert r.status_code == 201 and r.json()["puntaje"] == 90.0
    assert cliente.post(f"/api/sus/{curso_id}", json={"respuestas": [3] * 10}, headers=estudiante).status_code == 409
    assert cliente.post(f"/api/sus/{curso_id}", json={"respuestas": [6] * 10}, headers=estudiante).status_code == 422

    analitica = cliente.get(f"/api/cursos/{curso_id}/analitica", headers=docente).json()
    assert analitica["resumen"]["pares_aceptados"] >= 1
    assert any(r["codigo"] == "CARRERA_PROBABLE" for r in analitica["retro_frecuente"])
    assert analitica["sus"]["resumen"]["n"] == 1 and analitica["sus"]["resumen"]["media"] == 90.0

    csv = cliente.get(f"/api/cursos/{curso_id}/exportar/envios.csv", headers=docente)
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    lineas = csv.text.lstrip("﻿").strip().splitlines()
    assert lineas[0].startswith("estudiante,laboratorio") and len(lineas) >= 3
    assert "estudiante@labpar.local" not in csv.text and lineas[1].split(",")[0].startswith("E-")
    assert cliente.get(f"/api/cursos/{curso_id}/exportar/sus.csv", headers=docente).text.count("\n") == 2


def test_referencia_actualiza_casos_y_edicion_docente(cliente, docente):
    lab = cliente.post("/api/laboratorios", json={
        "titulo": "Laboratorio de prueba", "modelo": "openmp",
        "plantilla": "int main(void){return 0;}",
        "solucion_referencia": "#include <stdio.h>\nint main(void){int a,b; if(scanf(\"%d %d\",&a,&b)!=2) return 1; printf(\"%d\\n\", a+b); return 0;}",
        "config": {"requisitos": [{"patron": "pragma", "mensaje": "usa pragma"}]},
    }, headers=docente)
    assert lab.status_code == 201, lab.text
    lab_id = lab.json()["id"]
    assert lab.json()["slug"] == "laboratorio-de-prueba"
    for entrada in ("1 2\n", "40 2\n"):
        assert cliente.post(f"/api/laboratorios/{lab_id}/casos", json={"nombre": entrada.strip(), "entrada": entrada, "visible": True},
                            headers=docente).status_code == 201
    r = cliente.post(f"/api/laboratorios/{lab_id}/generar-salidas", headers=docente)
    assert r.status_code == 202
    procesar_cola()
    casos = cliente.get(f"/api/laboratorios/{lab_id}", headers=docente).json()["casos"]
    assert [c["salida_esperada"].strip() for c in casos] == ["3", "42"]
    exportado = cliente.get(f"/api/laboratorios/{lab_id}/exportar", headers=docente).json()
    importado = cliente.post("/api/laboratorios/importar", json=exportado, headers=docente)
    assert importado.status_code == 201 and importado.json()["slug"] == "laboratorio-de-prueba-2"
    assert len(importado.json()["casos"]) == 2
    malo = cliente.post("/api/laboratorios", json={"titulo": "Malo", "modelo": "openmp",
                                                   "config": {"requisitos": [{"patron": "(", "mensaje": "x"}]}}, headers=docente)
    assert malo.status_code == 422
    assert cliente.delete(f"/api/laboratorios/{lab_id}", headers=docente).status_code == 204


def test_estado_del_sistema_y_administracion(cliente, admin, docente):
    estado = cliente.get("/api/admin/estado", headers=docente).json()
    assert "cola" in estado and estado["cola"]["pendientes"] == 0
    usuarios = cliente.get("/api/admin/usuarios", headers=admin).json()
    assert {u["rol"] for u in usuarios} >= {"admin", "docente", "estudiante"}
    assert cliente.get("/api/admin/usuarios", headers=docente).status_code == 403
    nuevo = cliente.post("/api/admin/usuarios", json={"nombre": "Profe 2", "email": "p2@x.co", "clave": "12345678", "rol": "docente"},
                         headers=admin)
    assert nuevo.status_code == 201
    yo = cliente.get("/api/auth/yo", headers=admin).json()
    assert cliente.patch(f"/api/admin/usuarios/{yo['id']}", json={"rol": "docente"}, headers=admin).status_code == 409


def test_edicion_por_autor_borradores_y_privacidad_de_envios(cliente, estudiante, docente, admin):
    lab_id = _lab_id(cliente, docente, "omp-02-pi-integracion")
    lab = cliente.get(f"/api/laboratorios/{lab_id}", headers=docente).json()
    assert lab["puede_editar"] is False and lab["del_banco"] is True
    campos = ("titulo", "modelo", "lenguaje", "nivel", "orden", "resumen", "enunciado_md", "plantilla", "solucion_referencia",
              "solucion_docente", "config", "objetivos", "conceptos", "preguntas", "pistas", "duracion_estimada_min", "publicado")
    datos = {k: lab[k] for k in campos}
    assert cliente.put(f"/api/laboratorios/{lab_id}", json=datos, headers=docente).status_code == 403
    assert cliente.post(f"/api/laboratorios/{lab_id}/generar-salidas", headers=docente).status_code == 403
    assert cliente.get(f"/api/laboratorios/{lab_id}", headers=admin).json()["puede_editar"] is True
    copia = cliente.post(f"/api/laboratorios/{lab_id}/duplicar", headers=docente)
    assert copia.status_code == 201, copia.text
    assert copia.json()["puede_editar"] and copia.json()["titulo"].endswith("(copia)") and not copia.json()["del_banco"]
    assert len(copia.json()["casos"]) == len(lab["casos"])
    assert cliente.put(f"/api/laboratorios/{copia.json()['id']}", json={**datos, "titulo": "Pi a mi manera"},
                       headers=docente).json()["titulo"] == "Pi a mi manera"

    # Autoguardado del editor
    lab_est = _lab_id(cliente, estudiante, "omp-01-suma-reduccion")
    assert cliente.get(f"/api/laboratorios/{lab_est}/borrador", headers=estudiante).json()["codigo"] is None
    assert cliente.put(f"/api/laboratorios/{lab_est}/borrador", json={"codigo": "int main(){}"}, headers=estudiante).status_code == 200
    assert cliente.get(f"/api/laboratorios/{lab_est}/borrador", headers=estudiante).json()["codigo"] == "int main(){}"
    assert cliente.get(f"/api/laboratorios/{copia.json()['id']}/borrador", headers=estudiante).status_code == 403
    assert cliente.delete(f"/api/laboratorios/{lab_est}/borrador", headers=estudiante).status_code == 204

    # El código de un estudiante solo lo ven él, el docente de su curso y el administrador
    assert cliente.post("/api/admin/usuarios", json={"nombre": "Profe 3", "email": "p3@x.co", "clave": "12345678", "rol": "docente"},
                        headers=admin).status_code == 201
    token = cliente.post("/api/auth/ingresar", json={"email": "p3@x.co", "clave": "12345678"}).json()["token"]
    otro = {"Authorization": f"Bearer {token}"}
    envio = cliente.get("/api/envios", headers=estudiante).json()[0]
    assert cliente.get(f"/api/envios/{envio['id']}", headers=docente).status_code == 200
    assert cliente.get(f"/api/envios/{envio['id']}", headers=admin).status_code == 200
    assert cliente.get(f"/api/envios/{envio['id']}", headers=otro).status_code == 403
    assert cliente.get(f"/api/envios/{envio['id']}/codigo", headers=otro).status_code == 403
    assert cliente.get(f"/api/envios?usuario_id={envio['usuario_id']}", headers=otro).json() == []
    assert cliente.get(f"/api/envios?curso_id={envio['curso_id']}", headers=otro).status_code == 403
    assert len(cliente.get(f"/api/envios?usuario_id={envio['usuario_id']}", headers=docente).json()) >= 2


def test_reclamo_respeta_las_capacidades_de_los_trabajadores(cliente, estudiante):
    from labpar.db import SesionLocal, ahora
    from labpar.modelos import Envio, Trabajador
    from labpar.worker import reclamar

    lab_cuda = _lab_id(cliente, estudiante, "cuda-01-suma-vectores")
    r = cliente.post("/api/envios", json={"laboratorio_id": lab_cuda, "codigo": "int main(){return 0;}", "tipo": "ejecucion"},
                     headers=estudiante)
    assert r.status_code == 202
    sin_gpu = {"nucleos": 2, "openmp": {"disponible": True}, "mpi": {"disponible": True}, "cuda": {"disponible": False}}
    con_gpu = {**sin_gpu, "cuda": {"disponible": True}}
    with SesionLocal() as db:
        # Sin un nodo con GPU en línea, cualquier trabajador lo toma (para responder «no disponible»)
        assert reclamar(db, "cpu-1", sin_gpu) is not None
        db.query(Envio).filter(Envio.id == r.json()["id"]).update({"estado": "pendiente", "trabajador": None})
        db.add(Trabajador(id="gpu-1", host="nodo-gpu", pid=1, capacidades=con_gpu, estado="libre", ultimo_latido=ahora()))
        db.commit()
        assert reclamar(db, "cpu-1", sin_gpu) is None  # lo deja para el nodo con GPU
        envio = reclamar(db, "gpu-1", con_gpu)
        assert envio is not None and envio.id == r.json()["id"]
        envio.estado = "completado"
        db.query(Trabajador).filter(Trabajador.id == "gpu-1").update({"estado": "detenido"})
        db.commit()


def test_modo_demo_restablece_las_contrasenas_publicadas(cliente):
    """Si la instalación arrancó primero sin LABPAR_DEMO, el administrador tiene otra contraseña: al activar el modo
    demostración, las cuentas que muestra la pantalla de ingreso deben funcionar."""
    from sqlalchemy import select

    from labpar.db import SesionLocal
    from labpar.modelos import Usuario
    from labpar.semilla import crear_demo
    from labpar.seguridad import hash_clave

    with SesionLocal() as db:
        admin = db.scalar(select(Usuario).where(Usuario.email == "admin@labpar.local"))
        admin.hash_clave = hash_clave("clave-aleatoria-de-un-arranque-sin-demo")
        db.commit()
    assert cliente.post("/api/auth/ingresar", json={"email": "admin@labpar.local", "clave": "admin12345"}).status_code == 401
    with SesionLocal() as db:
        crear_demo(db)
    cuentas = cliente.get("/api/auth/config-publica").json()["cuentas_demo"]
    assert [c["rol"] for c in cuentas] == ["Estudiante", "Docente", "Administrador"]
    for c in cuentas:
        r = cliente.post("/api/auth/ingresar", json={"email": c["email"], "clave": c["clave"]})
        assert r.status_code == 200, (c["email"], r.text)


def test_textos_de_laboratorio_bien_formados(cliente):
    """Un texto de YAML sin comillas con «: » se volvía un diccionario y rompía la pestaña Preguntas."""
    from conftest import _token

    docente = _token(cliente, "docente@labpar.local", "docente123")
    for resumen in cliente.get("/api/laboratorios", headers=docente).json():
        lab = cliente.get(f"/api/laboratorios/{resumen['id']}", headers=docente).json()
        for q in lab["preguntas"]:
            assert isinstance(q["pregunta"], str) and all(isinstance(o, str) for o in q["opciones"]), lab["slug"]
            assert 0 <= q["correcta"] < len(q["opciones"]), lab["slug"]
        assert all(isinstance(p, str) for p in lab["pistas"]), lab["slug"]
    base = {"titulo": "Laboratorio con preguntas", "modelo": "openmp"}
    malas = [
        {"pregunta": "¿?", "opciones": ["a", {"Nada": "b"}], "correcta": 0},
        {"pregunta": "¿?", "opciones": ["a", "b"], "correcta": 2},
        {"pregunta": "¿?", "opciones": ["solo una"], "correcta": 0},
    ]
    for q in malas:
        assert cliente.post("/api/laboratorios", json={**base, "preguntas": [q]}, headers=docente).status_code == 422, q
    assert cliente.post("/api/laboratorios", json={**base, "pistas": [{"a": "b"}]}, headers=docente).status_code == 422
    r = cliente.post("/api/laboratorios", json={**base, "objetivos": ["Texto antiguo"], "preguntas": [
        {"pregunta": "¿Bien?", "opciones": ["Sí", "No"], "correcta": 0}]}, headers=docente)
    assert r.status_code == 201, r.text
    assert r.json()["objetivos"] == [{"nivel": "", "texto": "Texto antiguo"}]
