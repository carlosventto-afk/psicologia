FROM node:20-alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BLOG_URL
ARG NEXT_PUBLIC_BUSCA_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_BLOG_URL=$NEXT_PUBLIC_BLOG_URL
ENV NEXT_PUBLIC_BUSCA_URL=$NEXT_PUBLIC_BUSCA_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# O Docker define HOSTNAME automaticamente como o ID do container, e o
# server.js standalone do Next usa essa variável pra decidir em qual
# endereço escutar — como o container fica em mais de uma rede overlay,
# isso faz ele escutar só numa delas (não necessariamente a que o Traefik
# usa). Forçar 0.0.0.0 escuta em todas as interfaces.
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
