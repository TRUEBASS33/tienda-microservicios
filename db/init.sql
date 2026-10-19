-- Cada microservicio tiene su propia base de datos (no comparten tablas).
-- Este script se ejecuta solo la primera vez que se crea el volumen de Postgres.
CREATE DATABASE usuarios_db;
CREATE DATABASE productos_db;
CREATE DATABASE pedidos_db;
