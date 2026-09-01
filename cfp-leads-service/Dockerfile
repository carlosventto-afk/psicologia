FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS runtime
WORKDIR /app

COPY cfp-leads-service/package.json cfp-leads-service/package-lock.json ./
RUN npm ci --omit=dev

COPY cfp-leads-service/src ./src

CMD ["node", "src/index.js"]
