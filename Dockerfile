FROM node:20-alpine AS base

ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["npx", "pm2-runtime", "ecosystem.config.js"]
