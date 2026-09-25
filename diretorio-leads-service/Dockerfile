FROM node:22-alpine AS runtime
WORKDIR /app

COPY diretorio-leads-service/package.json diretorio-leads-service/package-lock.json ./
RUN npm ci --omit=dev

COPY diretorio-leads-service/src ./src

USER node
CMD ["node", "src/index.js"]
