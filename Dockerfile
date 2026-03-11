FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ src/
COPY skills/ skills/

RUN npx tsc

CMD ["node", "--env-file=.env", "dist/index.js"]
