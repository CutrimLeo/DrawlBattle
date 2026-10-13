FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0 DATABASE_URL=file:/data/drawbattle.db
EXPOSE 3001
CMD ["node","scripts/container-start.mjs"]
