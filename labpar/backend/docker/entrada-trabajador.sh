#!/bin/sh
# Punto de entrada del trabajador del motor de evaluación.
#
# Bloquea la red para el usuario del aislamiento (LABPAR_UID_SANDBOX): los programas de los estudiantes no
# pueden abrir conexiones hacia la base de datos, la API, otros equipos de la red universitaria ni Internet.
# Solo se permite la interfaz de bucle local, que MPI usa para coordinar sus procesos dentro del nodo.
# Requiere la capacidad NET_ADMIN en el contenedor; sin ella el trabajador arranca igual y deja un aviso.
set -u
UID_AISLADO="${LABPAR_UID_SANDBOX:-}"
if [ -n "$UID_AISLADO" ] && [ "$(id -u)" = "0" ]; then
  bloqueada=1
  for cmd in iptables ip6tables; do
    command -v "$cmd" >/dev/null 2>&1 || continue
    "$cmd" -C OUTPUT -o lo -m owner --uid-owner "$UID_AISLADO" -j ACCEPT 2>/dev/null \
      || "$cmd" -A OUTPUT -o lo -m owner --uid-owner "$UID_AISLADO" -j ACCEPT 2>/dev/null || bloqueada=0
    "$cmd" -C OUTPUT -m owner --uid-owner "$UID_AISLADO" -j REJECT 2>/dev/null \
      || "$cmd" -A OUTPUT -m owner --uid-owner "$UID_AISLADO" -j REJECT 2>/dev/null || bloqueada=0
  done
  if [ "$bloqueada" = 1 ]; then
    echo "LabPar: red bloqueada para el usuario del aislamiento (uid $UID_AISLADO)."
  else
    echo "LabPar: AVISO: no se pudo bloquear la red del aislamiento; agrega «cap_add: [NET_ADMIN]» al servicio." >&2
  fi
fi
exec "$@"
