# Stage 1: Build the React application
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve the static files with a lightweight server
FROM node:20-alpine
WORKDIR /app

# We need a simple server to host the static files
COPY package*.json ./
RUN npm install express

COPY --from=build /app/dist ./dist

# Create a simple Express server
RUN echo 'import express from "express"; \
import path from "path"; \
import { fileURLToPath } from "url"; \
const app = express(); \
const __filename = fileURLToPath(import.meta.url); \
const __dirname = path.dirname(__filename); \
app.use(express.static(path.join(__dirname, "dist"))); \
app.get("/*", (req, res) => { \
  res.sendFile(path.join(__dirname, "dist", "index.html")); \
}); \
const port = process.env.PORT || 3000; \
app.listen(port, () => console.log(`Frontend server running on port ${port}`));' > server.js

EXPOSE 3000
CMD ["node", "server.js"]