-- Execute uma vez em uma base já criada. Faça uma cópia do banco antes da alteração.
USE ecomcore;

-- O fluxo de convite precisa permitir senha vazia até o primeiro acesso.
ALTER TABLE usuario
    MODIFY senha VARCHAR(255) NULL,
    ADD COLUMN token_ativacao_hash CHAR(64) NULL,
    ADD COLUMN token_ativacao_expira DATETIME NULL,
    ADD UNIQUE KEY uq_usuario_email (email);
