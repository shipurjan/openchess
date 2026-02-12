# OpenChess — Product Specification

## Overview

OpenChess is a self-hostable, open-source anonymous real-time chess platform. Two players share a link and play — no accounts, no lobby, no matchmaking. Games use server-side move validation over WebSockets, with finished games archived to PostgreSQL.

## Core Flow

1. Player creates a new game (selects time control, public/private)
2. Gets a shareable link — creator plays as white by default
3. Sends link to a friend (or waits in the public lobby)
4. Second player opens the link and joins as black
5. Both players connect via WebSocket for real-time play
6. Server validates every move with chess.js before broadcasting
7. Finished games are archived to PostgreSQL for browsing

No accounts. No matchmaking. Just a link.

## Tech Stack

- **Framework**: Next.js (App Router) + TypeScript
- **Real-time**: Custom HTTP server with WebSocket (ws)
- **Live state**: Redis (ioredis) — game sessions, moves, connections
- **Archive**: PostgreSQL + Prisma — finished games only
- **Chess logic**: chess.js — validation, check/checkmate, PGN
- **Chess UI**: react-chessboard — drag-and-drop board
- **Styling**: Tailwind CSS + shadcn/ui
- **Deployment**: Docker (multi-stage build)

## Architecture

### Two-tier storage

- **Redis**: All live game state — sessions, moves, clocks, connections, draw offers, spectators. Fast and ephemeral. Every key has a TTL.
- **PostgreSQL**: Archive of finished games only. Permanent history. Games are written here once when they end.

### Server

A custom `server.ts` wraps Next.js with an HTTP server and attaches the WebSocket server. It also starts a background sweep job to clean up orphaned Redis keys.

## Data Model

### Redis (live games)

Each game is stored as a Redis hash at `game:{id}` with fields:
- `id`, `status`, `fen`, `whiteToken`, `blackToken`
- `timeControl`, `increment`, `whiteTime`, `blackTime`
- `lastMoveAt`, `isPublic`, `createdAt`, `creatorIp`
- `drawOfferedBy`, `rematchOfferedBy`, `rematchGameId`

Moves stored as a Redis list at `game:{id}:moves` (JSON-encoded).

Connection state tracked at `game:{id}:connections` (hash of token→timestamp).

### PostgreSQL (archived games)

**Game table**: id, status, result, white/black tokens, time control, PGN, timestamps.
**Move table**: game reference, move number, from/to squares, SAN notation, FEN after move, timestamps.

## Game Lifecycle

1. **WAITING** — Created, waiting for second player
2. **PLAYING** — Both players connected, game in progress
3. **FINISHED** — Game ended (checkmate, stalemate, resignation, timeout, draw)
4. **ABANDONED** — Player disconnected and didn't return within timeout

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/games` | Create a new game |
| POST | `/api/games/[id]/join` | Join as black player |
| GET | `/api/games/[id]/pgn` | Download PGN |
| POST | `/api/games/[id]/claim` | Claim token for rematch |
| GET | `/api/games/public` | List public waiting games |
| GET | `/api/games/archive` | Paginated archived games |
| GET | `/api/health` | Health check (Redis + Postgres) |

## WebSocket Messages

### Client → Server
- `move` — Make a move (from, to, promotion)
- `resign` — Resign the game
- `offer_draw` — Offer a draw
- `accept_draw` — Accept a draw offer
- `decline_draw` — Decline a draw offer
- `offer_rematch` — Offer a rematch
- `accept_rematch` — Accept rematch offer
- `flag` — Claim opponent's time ran out

### Server → Client
- `game_state` — Full game state on connect
- `move` — Validated move broadcast
- `game_over` — Game ended with result
- `draw_offered` — Draw offer from opponent
- `draw_declined` — Draw offer declined
- `rematch_offered` — Rematch offer from opponent
- `rematch_created` — New game ID for rematch
- `opponent_connected` / `opponent_disconnected`
- `error` — Validation or protocol error
- `abandonment_warning` — Opponent may abandon
- `spectator_count` — Updated spectator count

## Pages

- **/** — Landing page with hero, how-it-works section, public game lobby
- **/new** — Game creation form (time control, public/private, color preference)
- **/game/[id]** — Game board with clocks, move list, action buttons
- **/about** — About the project
- **/archive** — Browse archived games

## Time Controls

Games support configurable time controls:
- Base time: 1–60 minutes
- Increment: 0–30 seconds per move
- Default: 10+0 (10 minutes, no increment)

Clocks are managed server-side in Redis. Time deduction uses Lua scripts for atomicity.

## Resource Protection

This is a public anonymous app. Defensive design throughout:
- Rate limiting on game creation (per IP, via Redis)
- Max active games per IP
- TTL on all Redis keys
- Background sweeper cleans orphaned/zombie games
- WebSocket message validation with size limits
- CORS validation on WebSocket upgrade
- Docker resource limits on Postgres and Redis

## Deployment

Single Docker image via multi-stage build. `docker-compose.yml` includes app, Postgres, and Redis services with health checks and resource limits.
