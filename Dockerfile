# Playwright + Node (Chromium уже в образе)
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p data/logos data/traces

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "web/server.js"]
