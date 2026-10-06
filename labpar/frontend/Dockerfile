# Interfaz web de LabPar: se compila con Node y se sirve con nginx, que además redirige /api a la API.
FROM node:24-bookworm-slim AS construccion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx/labpar.conf /etc/nginx/conf.d/default.conf
COPY nginx/seguridad.conf /etc/nginx/snippets/labpar-seguridad.conf
COPY --from=construccion /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
