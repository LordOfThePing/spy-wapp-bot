# Spy WhatsApp Bot (Docker)

Bot de juego impostor para grupos de WhatsApp usando Baileys.

## Requisitos

- Docker
- Docker Compose

## Levantar con Docker

```bash
docker compose up --build
```

Esto hace:

- compila TypeScript dentro de la imagen
- ejecuta el bot en modo produccion
- persiste sesion de WhatsApp en `./auth`
- usa banco de palabras desde `./data/wordbank.json`

## Vincular WhatsApp

Al iniciar, Baileys imprime un QR en consola. Escanealo desde WhatsApp en:

- Dispositivos vinculados
- Vincular un dispositivo

## Comandos utiles

```bash
docker compose up -d
docker compose logs -f spy-bot
docker compose restart spy-bot
docker compose down
```

## Comandos con Makefile

```bash
make help
make up
make up-build
make logs-follow
make down
```

## Notas

- Si queres reiniciar sesion de WhatsApp, elimina `./auth`.
- El archivo de palabras se edita en `data/wordbank.json`.
