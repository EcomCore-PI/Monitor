FROM python:3.12-slim
WORKDIR /app

# Java 25 (mesma versao do pom.xml) copiado da imagem oficial do Temurin
COPY --from=eclipse-temurin:25-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

RUN pip install --no-cache-dir mysql-connector-python psutil

COPY . .
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

EXPOSE 8000
CMD ["./start.sh"]
