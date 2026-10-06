// Aplica el tema guardado antes del primer pintado para evitar un destello (archivo aparte: la política CSP
// del servidor no permite scripts en línea).
try {
  var t = localStorage.getItem("labpar.tema");
  if (t === "claro" || t === "oscuro") document.documentElement.dataset.tema = t;
} catch (e) {}
