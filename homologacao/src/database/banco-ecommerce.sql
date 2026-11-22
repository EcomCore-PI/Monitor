CREATE DATABASE IF NOT EXISTS ecomcore;
USE ecomcore;

-- drop database ecomcore;

CREATE TABLE empresa (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cnpj CHAR(14),
    razao_social VARCHAR(160),
    nome_fantasia VARCHAR(160),
    email_contato VARCHAR(255),
    status VARCHAR(30),
    data_cadastro DATETIME
);

CREATE TABLE tipo_cargo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_cargo ENUM("admin", "rh", "analista", "gestor")
);

CREATE TABLE tipo_componente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(45),
    unidade_medida VARCHAR(30)
);


CREATE TABLE metrica (
    id INT AUTO_INCREMENT PRIMARY KEY,
    limite_atencao DECIMAL(12,3),
    limite_critico DECIMAL(12,3)
);


CREATE TABLE local_empresa (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fk_empresa INT,
    nome_local VARCHAR(100),
    cep CHAR(8),
    logradouro VARCHAR(150),
    numero VARCHAR(20),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado CHAR(2),
    pais VARCHAR(50),

    CONSTRAINT fk_local_empresa_empresa
        FOREIGN KEY (fk_empresa)
        REFERENCES empresa(id)
);

CREATE TABLE usuario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100),
    email VARCHAR(300) NOT NULL UNIQUE,
    senha VARCHAR(255) NULL,
    enviou_email TINYINT(1),
    fk_empresa INT,
    fk_cargo INT,
    token_ativacao_hash CHAR(64) NULL,
    token_ativacao_expira DATETIME NULL,

    CONSTRAINT fk_usuario_empresa
        FOREIGN KEY (fk_empresa)
        REFERENCES empresa(id),

    CONSTRAINT fk_usuario_cargo
        FOREIGN KEY (fk_cargo)
        REFERENCES tipo_cargo(id)
);

CREATE TABLE componente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descricao VARCHAR(255),
    fk_tipo_componente INT,

    CONSTRAINT fk_componente_tipo
        FOREIGN KEY (fk_tipo_componente)
        REFERENCES tipo_componente(id)
);


CREATE TABLE servidor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100),
    fk_empresa INT,
    fk_local INT,
    hostname VARCHAR(255) NOT NULL UNIQUE,

    CONSTRAINT fk_servidor_empresa
        FOREIGN KEY (fk_empresa)
        REFERENCES empresa(id),

    CONSTRAINT fk_servidor_local
        FOREIGN KEY (fk_local)
        REFERENCES local_empresa(id)
);


CREATE TABLE especificacao_tecnica (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fk_servidor INT,
    fk_componente INT,
    fk_metrica INT,
    ativo TINYINT(1),

    CONSTRAINT fk_especificacao_servidor
        FOREIGN KEY (fk_servidor)
        REFERENCES servidor(id),

    CONSTRAINT fk_especificacao_componente
        FOREIGN KEY (fk_componente)
        REFERENCES componente(id),

    CONSTRAINT fk_especificacao_metrica
        FOREIGN KEY (fk_metrica)
        REFERENCES metrica(id)
);


CREATE TABLE captura (
    id INT AUTO_INCREMENT PRIMARY KEY,
    valor DECIMAL(15,4),
    horario DATETIME,
    fk_especificacao_tecnica INT,

    CONSTRAINT fk_captura_especificacao
        FOREIGN KEY (fk_especificacao_tecnica)
        REFERENCES especificacao_tecnica(id)
);

CREATE TABLE alerta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fk_captura INT,
    nivel ENUM('ATENCAO', 'CRITICO'),
    data DATETIME,

    CONSTRAINT fk_alerta_captura
        FOREIGN KEY (fk_captura)
        REFERENCES captura(id)
);

INSERT INTO tipo_cargo (nome_cargo) VALUES
('admin'),
('gestor'),
('analista'),
('rh');


INSERT INTO empresa
(cnpj, razao_social, nome_fantasia, email_contato, status, data_cadastro)
VALUES
('12345678000190', 'Shopee LTDA',
 'Shopee', 'ti@shopee.com',
 'Ativo', NOW()),

('98765432000110', 'Aliexpress LTDA',
 'Aliexpress', 'suporte@aliexpress.com',
 'Ativo', NOW()),

('45678912000155', 'Netshoes LTDA',
 'Netshoes', 'contato@netshoes.com',
 'Ativo', NOW());

-- =====================================================
-- 3. LOCAL_EMPRESA
-- =====================================================

INSERT INTO local_empresa
(fk_empresa, nome_local, cep, logradouro, numero,
 complemento, bairro, cidade, estado, pais)
VALUES
(1, 'Unidade Central', '01310100', 'Avenida Paulista',
 '1000', 'Bloco A', 'Bela Vista', 'Sao Paulo', 'SP', 'Brasil'),

(1, 'Unidade de Distribuição', '01414001', 'Rua Augusta',
 '500', 'Setor de Distribuição', 'Consolacao', 'Sao Paulo', 'SP', 'Brasil'),

(2, 'Unidade Principal', '20040002', 'Rua da Assembleia',
 '200', NULL, 'Centro', 'Rio de Janeiro', 'RJ', 'Brasil'),

(3, 'Unidade de Entrega', '30130110', 'Avenida Afonso Pena',
 '800', 'Sala 10', 'Centro', 'Belo Horizonte', 'MG', 'Brasil');

-- =====================================================
-- 4. USUARIO
-- =====================================================

INSERT INTO usuario
(nome, email, senha, fk_empresa, fk_cargo)
VALUES
('Marco',    'marco@gmail.com', 'Senha123', '1',  1),
('Isabelle', 'isa@gmail.com', 'Senha123', '2', 2),
('Ana', 'ana@gmail.com', 'Senha123', '3',  3),
('João',   'joao@gmail.com', 'Senha123', '2', 4),
('Math',    'math@gmail.com',         'Senha123', '3',       1);

-- =====================================================
-- 5. TIPO_COMPONENTE
-- =====================================================

INSERT INTO tipo_componente (nome, unidade_medida) VALUES
('CPU', '%'),
('RAM', '%'),
('Disco', '%'),
('Rede', 'Mbps');

-- =====================================================
-- 6. COMPONENTE
-- =====================================================

INSERT INTO componente (descricao, fk_tipo_componente) VALUES
('Intel Xeon', 1),
('4GB', 2),
('512GB', 3),
('Interface de rede Gigabit', 4),
('Intel Core i7', 1),
('16GB', 2),
('1TB', 3),
('Interface de rede 10GbE', 4);

-- =====================================================
-- 7. METRICA
-- =====================================================

INSERT INTO metrica (limite_atencao, limite_critico) VALUES
(70.000, 90.000),   -- CPU: percentual de uso
(75.000, 90.000),   -- RAM: percentual de uso
(80.000, 95.000),   -- Disco: percentual de uso
(700.000, 900.000); -- Rede: exemplo de limite em Mbps
	
-- =====================================================
-- 8. SERVIDOR
-- =====================================================

INSERT INTO servidor
(nome, fk_empresa, fk_local, hostname)
VALUES
('Servidor 1', 1, 1,
 'SRV-001'),

('Servidor 2', 1, 2,
 'SRV-002'),

('Servidor 3', 2, 3,
 'SRV-003'),

('Servidor 4', 3, 4,
 'SRV-004'),
 
 ('Servidor 5', 3, 4,
 'SRV-005');
