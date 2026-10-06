#!/bin/sh
# Copia de seguridad de la base de datos de LabPar (envíos, cursos, laboratorios, encuestas).
# Uso: ./scripts/respaldar.sh [directorio]   (por defecto ./respaldos)
# Programe su ejecución diaria con cron, por ejemplo:  15 2 * * * cd /ruta/labpar && ./scripts/respaldar.sh
set -eu
destino="${1:-respaldos}"
mkdir -p "$destino"
archivo="$destino/labpar-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U labpar -d labpar --no-owner --clean --if-exists | gzip > "$archivo"
echo "Copia guardada en $archivo"
# Conserva las últimas 30 copias
ls -1t "$destino"/labpar-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
