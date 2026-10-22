# LifeOS — Personal AI Planning Agent

> **Amazon AppDev 2026 Alexa+ Hackathon**  
> LifeOS is an intelligent planning assistant designed to manage tasks, schedules, and daily routines seamlessly. Built with Node.js, Express, TypeScript, PostgreSQL, Prisma ORM, and the official Model Context Protocol (MCP) TypeScript SDK with Streamable HTTP transport.

---

## Architecture Overview

```
├── prisma/
│   ├── schema.prisma       # Data models: User, Task, CalendarEvent, UserPreference, Plan, PlanItem, ActionHistory, Conversation, ConversationMessage
│   ├── seed.ts             # Deterministic seed data (Asia/Kolkata demo user, sample events & tasks)
│   └── migrations/         # PostgreSQL migration history
├── src/
│   ├── db/
│   │   └── client.ts       # PrismaClient singleton & user resolution
│   ├── services/
│   │   ├── taskService.ts      # Task CRUD, multi-user isolation & ActionHistory audit
│   │   ├── preferenceService.ts# Work hours & focus/break preference logic
│   │   ├── contextService.ts   # Timezone-aware day context aggregator
│   │   └── planService.ts      # Plan persistence, approval protection & transactions
│   ├── planner/
│   │   ├── types.ts        # Interfaces for tasks, slots, scheduled items & metrics
│   │   ├── intervals.ts    # Timezone-aware busy interval merging & free slot math
│   │   ├── scheduler.ts    # Deterministic greedy scheduling engine with focus breaks & splitting
│   │   └── validator.ts    # Independent final plan validation pass
│   ├── agent/
│   │   ├── types.ts        # LLM message, tool definitions & agent result types
│   │   ├── prompt.ts       # Anti-hallucination grounded system prompt
│   │   ├── mcpClient.ts    # Official MCP client (in-memory & HTTP transport)
│   │   ├── agentLoop.ts    # Bounded conversational loop with action feed recording
│   │   └── adapters/       # Replaceable model adapters (Gemini, OpenAI, Mock)
│   ├── tools/
│   │   ├── taskTools.ts        # create_task, list_tasks, update_task, complete_task, delete_task
│   │   ├── preferenceTools.ts  # get_preferences, update_preferences
│   │   ├── contextTools.ts     # get_day_context (backward-compatible contract)
│   │   ├── planTools.ts        # generate_plan, get_plan, approve_plan
│   │   └── register.ts         # Aggregates and mounts all 11 tools on McpServer
│   └── utils/
│       ├── timezone.ts     # Asia/Kolkata (+05:30) date range calculations
│       └── errors.ts       # Sanitized MCP error responses
├── tests/
│   ├── task.test.ts        # Task CRUD, filters, validation & status transitions
│   ├── preferences.test.ts # Preferences retrieval & boundary validations
│   ├── persistence.test.ts # Multi-user isolation & transaction verification
│   ├── scheduler.test.ts   # Deterministic scheduling, breaks, splits, dependencies & approval locks
│   ├── agent.test.ts       # Conversational tool calling, multi-tool requests & bounded execution
│   ├── mcpTools.test.ts    # McpServer registration & contract checks
│   └── verifyEndpoints.ts  # End-to-end live HTTP verification script for all 11 tools
├── server.ts               # Express server, health check & Streamable HTTP MCP transport
├── .env.example            # Environment template
└── tsconfig.json           # NodeNext TypeScript configuration
```

---

## Prerequisites

- **Node.js**: `v20.x` or `v22.x` (tested on Node v22.19.0)
- **npm**: `v10.x` or `v11.x`
- **PostgreSQL**: `v14+` (tested on PostgreSQL 18)

---

## Quick Start Guide

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/ChessyCake/amazon-developer-hackathon.git
cd amazon-developer-hackathon
npm install
```

### 2. Configure Environment Variables

Create your local `.env` file by copying the template:

```bash
cp .env.example .env
```

Edit `.env` to match your local PostgreSQL credentials:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# PostgreSQL Connection String
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/lifeos?schema=public"

# Default Demo User
DEMO_USER_ID="demo-user-001"
DEMO_USER_EMAIL="demo@lifeos.local"
DEFAULT_TIMEZONE="Asia/Kolkata"
```

> **Note**: If your password contains special characters (like `@`, `#`, `%`), ensure they are URL-encoded (e.g. `@` becomes `%40`).

### 3. Database Migration & Seeding

```bash
# Generate Prisma Client
npm run db:generate

# Apply migrations to PostgreSQL
npm run db:migrate

# Seed deterministic initial data (Asia/Kolkata demo user, sample events & tasks)
npm run db:seed
```

### 4. Start the Application

```bash
# Start server in watch mode (auto-reloads on file save)
npm run dev
```

The server will start at:
- **Server URL**: `http://127.0.0.1:3000`
- **Health Check**: `http://127.0.0.1:3000/health`
- **MCP Endpoint**: `http://127.0.0.1:3000/mcp`

---

## Testing & Verification

### Run Automated Test Suite

Runs 15 automated integration tests verifying task CRUD, status transitions, preference boundaries, transaction atomicity, and multi-user isolation:

```bash
npm test
```

### Run Live MCP Verification Script

Tests all 8 registered tools against the running HTTP server:

```bash
npx tsx tests/verifyEndpoints.ts
```

---

## Interacting with the MCP Server

### Option A: Using the Official MCP Inspector

Start the MCP Inspector web UI:

```bash
npx @modelcontextprotocol/inspector
```

1. Open the inspector URL (e.g., `http://127.0.0.1:6274`).
2. Set transport type to **Streamable HTTP** (or **SSE / HTTP**).
3. Connect to URL: `http://127.0.0.1:3000/mcp`.
4. Inspect and invoke any of the 8 available tools.

### Option B: Using cURL / HTTP Requests

Because LifeOS uses Streamable HTTP transport, requests must include `Accept: application/json, text/event-stream`:

#### 1. List Available Tools
```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### 2. Get Day Context (`get_day_context`)
```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_day_context","arguments":{"date":"2026-10-18"}}}'
```

#### 3. Create a Task (`create_task`)
```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_task","arguments":{"title":"Prepare Alexa Demo","duration":45,"priority":"HIGH","tags":["alexa","presentation"]}}}'
```

#### 4. List Tasks (`list_tasks`)
```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_tasks","arguments":{"status":"PENDING"}}}'
```

#### 5. Complete a Task (`complete_task`)
```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"complete_task","arguments":{"id":"<TASK_ID>"}}}'
```

#### 6. Update Preferences (`update_preferences`)
```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"update_preferences","arguments":{"focusMinutes":50,"breakMinutes":10,"workStartTime":"09:00","workEndTime":"18:00"}}}'
```

---

## Registered MCP Tools

| Tool | Description | Inputs |
| :--- | :--- | :--- |
| `create_task` | Creates a new task with title, description, duration, priority, deadline, and tags. | `title` (required), `description`, `duration`, `priority`, `deadline`, `tags`, `userId` |
| `list_tasks` | Lists tasks with optional filtering by status, priority, tag, or due date. | `status`, `priority`, `tag`, `date`, `userId` |
| `update_task` | Updates task fields, deadline, priority, or status. | `id` (required), `title`, `description`, `duration`, `priority`, `deadline`, `status`, `tags`, `userId` |
| `complete_task` | Marks a task as completed and records `completedAt`. | `id` (required), `userId` |
| `delete_task` | Deletes a task owned by the user. | `id` (required), `userId` |
| `get_preferences` | Retrieves active user preferences and timezone. | `userId` |
| `update_preferences` | Updates focus/break times, working hours, buffers, or timezone. | `focusMinutes`, `breakMinutes`, `workStartTime`, `workEndTime`, `bufferMinutes`, `timezone`, `userId` |
| `get_day_context` | Aggregates fixed calendar events, pending tasks, and preferences for a date. | `date` (YYYY-MM-DD, required), `userId` |
| `generate_plan` | Deterministically schedules tasks around fixed events with breaks, focus slots, and validation. Saves DRAFT plan. | `date` (YYYY-MM-DD, required), `overwriteApproved`, `userId` |
| `get_plan` | Retrieves proposed DRAFT or ACTIVE daily schedule. | `date` (YYYY-MM-DD, required), `userId` |
| `approve_plan` | Approves a proposed DRAFT plan, transitioning it to ACTIVE status with approval lock. | `planId` (required), `userId` |

---

## All Available npm Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `tsx watch server.ts` | Starts the server with live hot-reloading |
| `npm test` | `tsx --test tests/**/*.test.ts` | Executes the automated test suite |
| `npm run db:generate` | `prisma generate` | Generates the Prisma Client |
| `npm run db:migrate` | `prisma migrate dev` | Runs pending database migrations |
| `npm run db:deploy` | `prisma migrate deploy` | Applies migrations in production |
| `npm run db:seed` | `tsx prisma/seed.ts` | Populates database with deterministic demo data |
