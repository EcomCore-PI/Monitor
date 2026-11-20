FROM eclipse-temurin:25-jdk AS java-build
WORKDIR /build
COPY Individuais/Matheus/NetworkMonitor.java .
RUN mkdir -p /out && javac -d /out NetworkMonitor.java

FROM python:3.12-slim
WORKDIR /app

# Java 25 (mesma versao do pom.xml) copiado da imagem oficial do Temurin
COPY --from=eclipse-temurin:25-jre /opt/java/openjdk /opt/java/openjdk
COPY --from=java-build /out /app/java
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"
ENV NETWORK_MONITOR_CLASS_PATH=/app/java

RUN pip install --no-cache-dir mysql-connector-python psutil

COPY . .
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

EXPOSE 8000
CMD ["./start.sh"]
