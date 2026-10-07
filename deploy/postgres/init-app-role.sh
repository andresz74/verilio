#!/bin/sh
set -eu

app_password=$(cat /run/secrets/postgres_app_password)

psql \
  --set=ON_ERROR_STOP=1 \
  --set=app_database="$VERILIO_DB_NAME" \
  --set=app_password="$app_password" \
  --set=app_user="$VERILIO_DB_USER" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password';
CREATE DATABASE :"app_database" OWNER :"app_user";
SQL

