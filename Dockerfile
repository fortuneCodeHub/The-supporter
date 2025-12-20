# Step 1: Build the NestJS application
FROM node:19.3.0 AS build
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .

RUN npm run build

# Step 2: Production image
FROM node:19.3.0
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/src/main"]
