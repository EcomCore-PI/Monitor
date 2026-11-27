FROM eclipse-temurin:25-jdk AS java-build
WORKDIR /build
COPY Individuais/Matheus/NetworkMonitor.java .
RUN mkdir -p /out/classes \
    && javac -encoding UTF-8 -d /out/classes NetworkMonitor.java \
    && jar --create --file /out/network-monitor.jar --main-class NetworkMonitor -C /out/classes .

FROM python:3.12-slim
WORKDIR /app

# Java 25 (mesma versao do pom.xml) copiado da imagem oficial do Temurin
COPY --from=eclipse-temurin:25-jre /opt/java/openjdk /opt/java/openjdk
COPY --from=java-build /out/network-monitor.jar /opt/network-monitor/network-monitor.jar
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"
ENV NETWORK_MONITOR_JAR=/opt/network-monitor/network-monitor.jar

RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir mysql-connector-python psutil

COPY . .
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

EXPOSE 8000
CMD ["bash", "./start.sh"]
