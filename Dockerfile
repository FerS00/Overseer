# ===== 1) Frontend (Angular) =====
FROM node:24-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ===== 2) Backend (Spring Boot) =====
FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /build
COPY backend/pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
# Inyecta el build de Angular en los estáticos del jar
COPY --from=frontend /app/dist/agent-ops/browser ./src/main/resources/static
RUN mvn -q -B -DskipTests package

# ===== 3) Runtime =====
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=backend /build/target/agent-ops-*.jar app.jar
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/data \
    && chown -R app:app /app
USER app
EXPOSE 8787
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
