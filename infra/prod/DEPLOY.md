# Deploying inChat to the server (16.170.99.233)

The app comes up on **http://16.170.99.233:8055**. Docker + Compose are already
installed on the box. You run these commands over SSH (MobaXterm).

---

## 1. Open the required ports (AWS security group)

In the EC2 console → the instance's **Security Group** → inbound rules, allow
from your users (or `0.0.0.0/0` for a quick internal launch):

| Port | Proto | Why |
|------|-------|-----|
| 8055 | TCP | the web app |
| 9000 | TCP | file/image/voice downloads (MinIO presigned URLs) |
| 7880 | TCP | LiveKit signaling (calls) |
| 7881 | TCP | LiveKit RTC/TCP |
| 7882 | UDP | LiveKit RTC/UDP |

(Port 22 is already open — that's how you SSH in.)

---

## 2. Clone the repo on the server

```sh
cd ~
git clone https://github.com/hanounpeter-lgtm/inMobilesLiveChat.git inchat
cd inchat/infra/prod
```

## 3. Create the production env file

```sh
cp .env.prod.example .env.prod
nano .env.prod
```

Fill in every `CHANGE_ME`:

- `POSTGRES_PASSWORD` and the matching password inside `DATABASE_URL`
- `JWT_ACCESS_SECRET` → run `openssl rand -base64 48` and paste it
- `S3_SECRET_KEY` (any strong string)
- `GIPHY_API_KEY` if you want GIF search (optional)

The `PUBLIC_IP`, `WEB_ORIGIN`, and `S3_PUBLIC_ENDPOINT` are already set to
16.170.99.233 — change them only if the IP changes or you add a domain.

## 4. Build and start everything

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

First build takes a few minutes (it compiles the API and the web app). Watch
progress with:

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api web
```

The API runs database migrations automatically on startup.

## 5. Create the workspace + first account

The database starts empty. Seed the demo workspace and users (includes an
admin login and the default channels):

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml exec api pnpm db:seed
```

That prints the seeded logins (all password `inmobiles123`, e.g.
`admin@inmobiles.com`). **Change the admin password after first login**, or
create your own admin instead:

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec api pnpm user:create you@inmobiles.com "Your Name" a-strong-password owner
```

## 6. Open it

Visit **http://16.170.99.233:8055** and sign in.

---

## Connecting DBeaver to the database

Postgres is only bound inside Docker by default. Two options:

- **Simplest:** add `- '5432:5432'` under the `postgres` service `ports:` in
  `docker-compose.prod.yml`, open port 5432 in the security group, re-run the
  `up -d` command, then in DBeaver connect to host `16.170.99.233`, port `5432`,
  database `inchat`, user/password from `.env.prod`.
- **Safer:** leave 5432 closed and use MobaXterm's SSH tunnel (local port 5432
  → server `localhost:5432`), then point DBeaver at `localhost:5432`.

## Updating after new commits

```sh
cd ~/inchat && git pull
cd infra/prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

## Notes / hardening later

- **HTTPS:** the deploy is plain HTTP on an IP. When you add a domain, put
  Caddy/Cloudflare in front with TLS and set `COOKIE_SECURE=true` in `.env.prod`.
- **LiveKit** runs in `--dev` mode (keys `devkey`/`secret`). Fine for internal
  use; swap for generated keys before exposing calls widely.
- **Backups:** the `pgdata` and `miniodata` Docker volumes hold all data.
