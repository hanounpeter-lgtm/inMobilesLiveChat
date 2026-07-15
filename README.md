# inMobiles Chat

Internal team chat platform (Slack/Teams style) for inMobiles. Monorepo:

- `apps/api` — NestJS + Socket.IO + Prisma (PostgreSQL) + Redis
- `apps/web` — React + Vite + TanStack Query + Zustand
- `packages/shared-types` — socket event names + zod DTOs shared by both apps
- `infra/` — Docker Compose dev stack (Postgres, Redis, MinIO, Mailpit)

## Getting started

```sh
pnpm install
copy .env.example .env
pnpm stickers                 # download the animated sticker pack (~27MB, one-time)
pnpm infra:up                 # postgres, redis, minio, mailpit, livekit
pnpm db:migrate               # prisma migrate dev
pnpm db:seed                  # demo workspace, users, channels
pnpm dev                      # api on :3001, web on :5173
```

Open http://localhost:5173 and sign in with a seeded account:

| Email | Password | Role |
|---|---|---|
| admin@inmobiles.com | inmobiles123 | owner |
| sara@inmobiles.com | inmobiles123 | admin |
| omar@inmobiles.com | inmobiles123 | member |
| lina@inmobiles.com | inmobiles123 | member |

## Browsing the database with pgAdmin

The database runs in Docker; connect pgAdmin to it like any server:

- Host: `localhost`, Port: `5432`
- Database: `inmobiles_chat`
- Username: `inmobiles`, Password: `inmobiles`

## Dev URLs

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:3001/api/healthz |
| MinIO console | http://localhost:9001 (inmobiles / inmobiles-secret) |
| Mailpit (dev email) | http://localhost:8025 |
