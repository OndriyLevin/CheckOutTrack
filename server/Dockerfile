FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache openssl
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 3000
VOLUME ["/app/uploads"]
CMD ["sh", "-c", "npm install && npx prisma generate && npx prisma db push && npm start"]
