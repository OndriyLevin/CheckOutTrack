# Build stage
FROM node:18-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:stable-alpine as production-stage
# Create the subdirectory
RUN mkdir -p /usr/share/nginx/html/music
# Copy to the subdirectory matches base: '/music/'
COPY --from=build-stage /app/dist /usr/share/nginx/html/music
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
