# ==========================================
# STAGE 1: Base Environment
# ==========================================
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# ==========================================
# STAGE 2: Install Dependencies & Source
# ==========================================
FROM base AS runner
# Traemos el argumento del directorio del servicio
ARG SERVICE_DIR
ENV NODE_ENV=production

# 1. Copiamos los manifiestos de dependencias por si existen en el servicio
COPY ${SERVICE_DIR}/package*.json ./

# 2. Instalamos dependencias de producción. Si no hay nada, continuará limpiamente sin romperse.
RUN npm ci --only=production || npm install --omit=dev || true

# 3. Copiamos el código fuente específico del servicio al directorio actual
COPY ${SERVICE_DIR}/ .

# Comando por defecto para iniciar el servicio interno
CMD ["node", "server.js"]
