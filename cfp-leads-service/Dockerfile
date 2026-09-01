FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runtime
WORKDIR /app

COPY cfp-leads-service/package.json cfp-leads-service/package-lock.json ./
RUN npm ci --omit=dev

COPY cfp-leads-service/src ./src

# A imagem base traz o usuário pwuser exatamente pra isso: não rodar um browser
# contra conteúdo remoto não confiável como root.
USER pwuser

CMD ["node", "src/index.js"]
