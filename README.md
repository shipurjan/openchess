# openchess

Anonymous real-time chess platform. No accounts, no matchmaking — just share a link and play.

Real-time WebSocket gameplay with server-side validation, configurable time controls, public lobby, spectators, PGN export, and game archival. Self-hostable via Docker.

**Docker Hub**: [shipurjan/openchess](https://hub.docker.com/r/shipurjan/openchess)

## Quick start

```bash
git clone git@github.com:shipurjan/openchess.git
cd openchess
docker compose up       # builds from source, available at localhost:3000
```

<details>
<summary><strong>Run from Docker Hub (recommended)</strong></summary>

Create a `docker-compose.yml`:

```yaml
services:
  app:
    image: shipurjan/openchess:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://openchess:openchess@db:5432/openchess
      - REDIS_URL=redis://redis:6379
      - HOSTNAME=0.0.0.0
      - CORS_ALLOWED_ORIGINS=http://localhost:3000
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  redis:
    image: redis:8.6.0-alpine3.23
    command: redis-server --maxmemory 100mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 5s
      retries: 10

  db:
    image: postgres:18.2-alpine3.23
    environment:
      POSTGRES_USER: openchess
      POSTGRES_PASSWORD: openchess
      POSTGRES_DB: openchess
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openchess"]
      interval: 2s
      timeout: 5s
      retries: 10
    volumes:
      - pgdata:/var/lib/postgresql

volumes:
  pgdata:
```

```bash
docker compose up
```

</details>

<details>
<summary><strong>Development setup</strong></summary>

Requires Node.js 22+, pnpm, and Docker.

```bash
pnpm install
pnpm services          # start Postgres + Redis
pnpm db:migrate        # run database migrations
pnpm dev               # start dev server at localhost:3000
```

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Build for production |
| `pnpm services` | Start Postgres + Redis |
| `pnpm services:stop` | Stop services |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:e2e` | Run E2E tests (Playwright) |

</details>

<details>
<summary><strong>Configuration</strong></summary>

Copy `.env.example` to `.env` for local development. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://openchess:openchess@localhost:5432/openchess` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `PORT` | `3000` | Server port |
| `CORS_ALLOWED_ORIGINS` | _(all in dev)_ | Allowed origins (comma-separated) |
| `LOG_LEVEL` | `debug` / `info` | Min log level (`debug`, `info`, `warn`, `error`) |
| `MAX_ACTIVE_GAMES_PER_IP` | `5` | Concurrent games per IP |
| `ABANDONMENT_TIMEOUT_SECONDS` | `300` | Seconds before a disconnected game is abandoned |
| `CLAIM_WIN_TIMEOUT_SECONDS` | `60` | Seconds before opponent can claim win on disconnect |
| `RATE_LIMIT_GAME_CREATE_MAX` | `10` | Max game creation requests per window |
| `RATE_LIMIT_WS_CONNECT_MAX` | `30` | Max WebSocket connections per window |
| `SWEEP_INTERVAL_MS` | `300000` | Background cleanup interval (ms) |

See `.env.example` for the full list.

</details>

## Architecture

```
Browser ←→ WebSocket ←→ server.ts ←→ Redis (live games)
                            ↓
                        PostgreSQL (archived games)
```

**Redis** holds all live state (sessions, moves, clocks). Every key has a TTL. A background sweeper cleans orphaned games. **PostgreSQL** stores finished games permanently for the archive and PGN export.

## Tech stack

Next.js (App Router) / TypeScript / Redis (ioredis) / PostgreSQL (Prisma) / chess.js / react-chessboard / WebSocket (ws) / Tailwind CSS
