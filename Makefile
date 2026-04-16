.PHONY: help up up-build down restart ps logs logs-follow build rebuild shell

down:
	docker-compose down

up-build:
	docker-compose up -d --build --force-recreate

logs-app:
	docker-compose logs -f spy-bot

rebuild-app: down up-build logs-app
