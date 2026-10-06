#!/bin/sh
# Restaura una copia de seguridad creada con respaldar.sh. Reemplaza los datos actuales.
# Uso: ./scripts/restaurar.sh respaldos/labpar-AAAAMMDD-HHMM.sql.gz
set -eu
[ $# -eq 1 ] || { echo "Uso: $0 archivo.sql.gz" >&2; exit 1; }
printf "Se reemplazarán los datos actuales con %s. Escriba SI para continuar: " "$1"
read -r respuesta
[ "$respuesta" = "SI" ] || { echo "Cancelado."; exit 1; }
docker compose stop trabajador api
gunzip -c "$1" | docker compose exec -T db psql -U labpar -d labpar -v ON_ERROR_STOP=1 -q
docker compose start api trabajador
echo "Restauración completada."
