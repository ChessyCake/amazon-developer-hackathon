# LifeOS — Autonomous Planning & Disruption Agent

> **Submission for the Amazon AppDev 2026 Alexa+ Hackathon ("Build, Ship, Shape")**  
> *Deterministic scheduling, adaptive disruption replanning, and mathematical deadline risk analysis powered by Model Context Protocol (MCP) Streamable HTTP transport and Conversational AI.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B%20%7C%20v22%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4-black.svg)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-teal.svg)](https://www.prisma.io/)
[![MCP](https://img.shields.io/badge/MCP%20SDK-Streamable%20HTTP-orange.svg)](https://modelcontextprotocol.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B%20(Neon)-blue.svg)](https://neon.tech/)
[![Tests](https://img.shields.io/badge/Tests-71%20Passed%20(100%25)-emerald.svg)](#testing--verification)

---

## Table of Contents

1. [Problem Statement & Target Users](#problem-statement--target-users)
2. [Product Features & Differentiators](#product-features--differentiators)
3. [Architecture & Technology Stack](#architecture--technology-stack)
4. [MCP Tool Catalog & API Contracts](#mcp-tool-catalog--api-contracts)
5. [Setup & Local Development](#setup--local-development)
6. [Environment Variables & Database Migrations](#environment-variables--database-migrations)
7. [Production Deployment Guide](#production-deployment-guide)
8. [Testing & Verification](#testing--verification)
9. [3-Minute Rehearsed Demo Script](#3-minute-rehearsed-demo-script)
10. [Known Limitations & Honest Integration Status](#known-limitations--honest-integration-status)
11. [Hackathon Submission & Friction Log](#hackathon-submission--friction-log)

---

## Problem Statement & Target Users

### The Problem
Traditional calendar and to-do apps are static repositories: when an unexpected disruption occurs (a laboratory class runs 60 minutes late, a child falls sick, or a production incident arises), users are forced to manually recalculate their entire day, reschedule conflicting tasks, and guess whether upcoming deadlines are now compromised. LLM-only chat assistants often hallucinate infeasible schedules, fabricate non-existent free time, or silently overwrite approved plans without explicit user consent.

### Target Users
- **Students & Researchers**: Balancing fixed academic blocks (lectures, labs, exams) with volatile project milestones.
- **Software Engineers & Knowledge Workers**: Navigating agile sprints, ad-hoc interruptions, deep work focus blocks, and dynamic priority shifts.
- **ADHD & Overloaded Individuals**: Benefiting from calm, deterministic scheduling guardrails that eliminate decision paralysis.

---

## Product Features & Differentiators

| Feature | LifeOS Differentiator | Traditional Calendar / LLM Chat |
| :--- | :--- | :--- |
| **Deterministic Scheduler** | Mathematical greedy slot-allocation engine respecting working hours, lunch buffers, focus/break cadences, task splitting, and hard deadlines. | Unrealistic text generation that ignores calendar conflicts or overlaps items. |
| **Disruption Replanning** | Structured diff calculation (`added`, `moved`, `removed`, `unchanged`) with explicit trade-off explanations before any database commit. | Destructive, silent schedule wiping or tedious manual drag-and-drop. |
| **Approval Guardrails** | Atomic version locking: proposed plans require explicit user confirmation. Rejects stale approvals and concurrent modifications. | Changes state without permission or risks race conditions. |
| **Compensating Rollback** | Transactional undo capability restoring previous active plan versions with full audit history. | Irreversible modifications once committed. |
| **Mathematical Risk Analysis** | Explicit calculation of available working minutes, required task minutes, and slack percentage without fabricated probabilities. | Hallucinated confidence estimates ("95% chance of success"). |
| **Official MCP Compliance** | Standard Streamable HTTP transport (`POST /mcp`) using the official `@modelcontextprotocol/sdk`. | Proprietary webhooks or vendor-locked chat plugins. |

---

## Architecture & Technology Stack

```mermaid
graph TD
    Client[Alexa+ Runtime / Browser / MCP Client] -->|Streamable HTTP POST /mcp| Server[Express Server :3000]
    BrowserUI[Next.js 16 Web Dashboard] -->|REST & Chat API /api/*| Server
    
    subgraph LifeOS Backend Core
        Server --> MCP[MCP Registry 17+ Tools]
        Server --> Agent[Agentic Bounded Loop]
        Agent --> Adapter[LLM Adapter Gemini / OpenAI / Mock]
        Agent --> MCPClient[Internal MCP Client]
        
        MCP --> TaskService[Task & Preference Service]
        MCP --> Scheduler[Deterministic Scheduler Engine]
        MCP --> ReplanService[Disruption & Diff Service]
        MCP --> GoalService[Goal & Risk Analysis Service]
    end
    
    subgraph Data Tier
        TaskService --> Prisma[Prisma ORM Client]
        Scheduler --> Prisma
        ReplanService --> Prisma
        GoalService --> Prisma
        Prisma --> NeonDB[(Neon Managed PostgreSQL 16)]
    end
```

### Technology Stack
- **Runtime & Language**: Node.js v22.x LTS, TypeScript 5.x (NodeNext ESM).
- **Backend API**: Express 4.x with production rate limiting (`express-rate-limit`), security headers (`helmet`), and live DB health check (`GET /health`).
- **Frontend App**: Next.js 16.4 (App Router) with React 19, Tailwind CSS v4, and Lucide icons.
- **Database & ORM**: PostgreSQL 16 (Neon Serverless with PgBouncer connection pooling), Prisma ORM 6.x.
- **Protocol**: Official Model Context Protocol (MCP) TypeScript SDK (`@modelcontextprotocol/sdk`) with Streamable HTTP transport.
- **AI Models**: Google Gemini 2.0 Flash (`@google/genai`), OpenAI GPT-4o-mini, and deterministic Mock adapters.

---

## MCP Tool Catalog & API Contracts

LifeOS registers all business logic as official MCP tools mounted on `POST /mcp`:

| Category | Tool Name | Description | Key Inputs |
| :--- | :--- | :--- | :--- |
| **Tasks** | `create_task` | Creates a task with duration, priority, deadline, tags, and dependencies. | `title`, `duration`, `priority`, `deadline`, `tags` |
| | `list_tasks` | Lists tasks filtered by status, priority, tag, or due date. | `status`, `priority`, `tag`, `date` |
| | `update_task` | Updates task parameters or status. | `id`, `title`, `duration`, `priority`, `deadline` |
| | `complete_task` | Marks a task completed and updates completion timestamp. | `id` |
| | `delete_task` | Soft-deletes or removes a task owned by user. | `id` |
| **Schedule** | `generate_plan` | Deterministically schedules tasks around fixed events with breaks. | `date`, `overwriteApproved` |
| | `get_plan` | Retrieves active or draft schedule for a date. | `date` |
| | `approve_plan` | Promotes a draft plan to ACTIVE status with approval lock. | `planId` |
| **Disruption** | `preview_replan` | Generates a revised schedule candidate with structured diff and trade-offs. | `date`, `delayedEvents`, `extendedTasks`, `preservedTaskIds` |
| | `compare_plans` | Computes diff between two plan versions (`added`, `moved`, `removed`). | `basePlanId`, `targetPlanId` |
| | `commit_plan` | Commits an approved proposal into ACTIVE status inside a transaction. | `planId`, `expectedVersion` |
| | `reject_plan` | Rejects proposal leaving active schedule untouched. | `planId`, `reason` |
| | `rollback_plan` | Safely restores previous plan version using compensating transaction. | `date`, `targetVersion`, `reason` |
| | `get_plan_history`| Retrieves full audit history of all plan versions for a date. | `date` |
| **Context & Goals** | `get_day_context` | Aggregates fixed calendar events, pending tasks, and preferences. | `date` |
| | `create_goal` | Creates high-level semester or quarterly objective. | `title`, `targetDate` |
| | `decompose_goal` | Decomposes goal into schedulable milestones and child tasks. | `goalId`, `milestones` |
| | `list_goals` | Computes goal completion percentages and remaining workload. | `status` |
| | `analyze_deadline_risks` | Mathematically evaluates slack minutes and bottleneck tasks. | `lookaheadDays`, `asOfDate` |
| **Routines & Focus** | `create_recurring_rule`| Configures daily, weekday, or custom repeating routines. | `title`, `frequency`, `duration` |
| | `generate_recurring_tasks`| Materializes routine instances into concrete schedulable tasks. | `targetDate`, `horizonDays` |
| | `get_daily_briefing`| Produces executive morning briefing from actual stored database records. | `date` |
| | `simulate_what_if_plans`| Compares Balanced, Deadline-First, and Goal-First schedules side-by-side. | `date` |
| | `start_focus_session`| Initiates a live tracked focus block on a task. | `taskId`, `notes` |
| | `complete_focus_session`| Concludes focus session, records actual time, updates task. | `sessionId`, `markTaskComplete` |

---

## Setup & Local Development

### Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **PostgreSQL**: v14+ (or Neon / Supabase cloud instance)
- **Git**

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/ChessyCake/amazon-developer-hackathon.git
cd amazon-developer-hackathon
npm install
npm --prefix frontend install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your database URL and model API key (see [Environment Variables](#environment-variables--database-migrations)).

### 3. Apply Database Migrations & Seed Deterministic Demo Data
```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database
npm run db:migrate

# Populate deterministic demo user, Chemistry Lab, academic tasks & baseline plan
npm run db:seed
```

### 4. Run Development Servers
```bash
# Terminal 1: Start Backend & MCP Server (:3000)
npm run dev

# Terminal 2: Start Next.js Frontend (:3000 via proxy / :3001)
npm --prefix frontend run dev
```

Visit `http://localhost:3000` in your browser.

---

## Environment Variables & Database Migrations

### Required Environment Variables (`.env`)

```env
# Server & Network Configuration
PORT=3000
NODE_ENV=production

# PostgreSQL Connection String (Remote Managed Neon / Local Docker)
DATABASE_URL="postgresql://user:password@ep-name-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=30"

# Default Demo User Context
DEMO_USER_ID="demo-user-001"
DEMO_USER_EMAIL="demo@lifeos.local"
DEFAULT_TIMEZONE="Asia/Kolkata"

# LLM Provider Configuration ("gemini", "openai", "mock")
LLM_PROVIDER="gemini"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.0-flash"

# Optional Alternative Model Provider
# OPENAI_API_KEY="your-openai-api-key"
# OPENAI_MODEL="gpt-4o-mini"
```

### Production Connection Pooling Gotchas
When using serverless PostgreSQL providers like Neon or Supabase, always append `&pgbouncer=true&connect_timeout=30` to your connection string to prevent connection exhaustion during concurrent tool executions.

---

## Production Deployment Guide

LifeOS is fully containerized and production-ready for deployment on any Node-compatible cloud provider.

### Option A: Docker & Docker Compose (Recommended)

1. Build and run both backend and managed PostgreSQL:
```bash
docker compose up -d --build
```
2. Run database migrations inside the container:
```bash
docker compose exec app npx prisma db push
docker compose exec app npm run db:seed
```

### Option B: Cloud Deployment (Railway / Render / AWS App Runner)

1. **Deploy Managed Database**:
   - Provision a PostgreSQL database on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
   - Copy the pooled connection string into `DATABASE_URL`.
2. **Deploy Web Service**:
   - Connect the GitHub repository to Railway or Render.
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Environment Variables**: Add `DATABASE_URL`, `GEMINI_API_KEY`, `NODE_ENV=production`.
3. **Run Production Migration & Seed**:
   - In the service console or build step:
   ```bash
   npx prisma db push
   npm run db:seed
   ```
4. **Verify Health & MCP Endpoints**:
   - `GET /health` returns `{"status":"ok","database":"connected","timestamp":"..."}`
   - `GET /mcp` returns JSON-RPC protocol capabilities.
   - `POST /mcp` accepts Streamable HTTP tool calls.

---

## Testing & Verification

The repository contains an automated test suite verifying every layer:

```bash
npm test
```

### Test Suite Breakdown (71 Tests Total)
- **Unit Tests** (`tests/unit/`): Interval math, busy merging, slack calculation, plan comparisons, deadline verification.
- **Integration Tests** (`tests/integration/`): Database persistence, multi-user tenant isolation, ActionHistory append-only audit, preference updates.
- **Agent Tests** (`tests/agent/`): Tool selection, malformed arguments, bounded tool recursion, model fallback.
- **End-to-End Tests** (`tests/e2e/`): Disruption injection, preview replan generation, structured diff, explicit approval commit.
- **Failure & Concurrency Tests** (`tests/failures/`): Stale approval rejection, version mismatch protection, network timeouts, duplicate requests.

---

## 3-Minute Rehearsed Demo Script

**Target Duration**: 2 minutes 50 seconds (strictly within the 3-minute hackathon rule).  
**Demo User**: `demo-user-001` | **Date**: `2026-10-22` | **Timezone**: `Asia/Kolkata`

```
+---------------+-------------------------------------------------------------+-------------------------------+
| Timeline      | Action & User Input                                         | What LifeOS Demonstrates      |
+---------------+-------------------------------------------------------------+-------------------------------+
| 0:00 - 0:35   | Speaker: "Welcome to LifeOS. Today is Oct 22, 2026. Let's   | Reads real database tasks and |
| (Baseline)    | ask LifeOS to review our day."                              | Chemistry Lab fixed event.    |
|               | Prompt: "What does my day look like today?"                 | Displays Version 1 ACTIVE     |
|               |                                                             | plan in the interactive UI.   |
+---------------+-------------------------------------------------------------+-------------------------------+
| 0:35 - 1:15   | Speaker: "Disruption strikes: our Chemistry Lab runs late."| Agent invokes preview_replan  |
| (Disruption)  | Prompt: "My lab ran an hour late. Replan my day, but        | tool with delayedEvents.      |
|               | preserve my exam preparation."                              | Explains exact trade-offs in  |
|               |                                                             | natural language.             |
+---------------+-------------------------------------------------------------+-------------------------------+
| 1:15 - 2:05   | Speaker: "Notice LifeOS did NOT wipe our schedule silently. | Displays structured diff:     |
| (Diff Review) | It computed a candidate Plan Version 2."                    | - Chemistry Lab: +60m delay   |
|               | Clicks: "Review Diff & Approve" modal.                      | - OS Assignment: Moved later  |
|               |                                                             | - Exam Prep: PRESERVED        |
+---------------+-------------------------------------------------------------+-------------------------------+
| 2:05 - 2:35   | Speaker: "We explicitly review and approve the proposal."   | Executes atomic commit_plan   |
| (Commit)      | Clicks: "Approve & Commit Plan".                            | transaction. Plan Version 2   |
|               |                                                             | becomes ACTIVE in PostgreSQL. |
+---------------+-------------------------------------------------------------+-------------------------------+
| 2:35 - 2:50   | Speaker: "We verify the audit history and timeline."        | Shows ActionHistory audit log |
| (Audit Feed)  | Clicks: Action History tab.                                 | and compensating rollback.    |
|               | Speaker: "LifeOS: Deterministic, disruption-safe AI."       | Clean finish at 2:50.         |
+---------------+-------------------------------------------------------------+-------------------------------+
```

---

## Known Limitations & Honest Integration Status

### Alexa+ Integration Architecture
- **MCP Server Compliance**: LifeOS implements the standard Model Context Protocol (MCP) using Streamable HTTP transport (`POST /mcp`) over JSON-RPC 2.0. Any compliant client (Claude Desktop, custom agent runtimes, or developer preview tools) can discover and invoke all tools remotely.
- **Alexa+ Track Context**: In accordance with Amazon AppDev 2026 hackathon guidelines, developer access to consumer-facing Alexa+ tool registration is in limited developer preview. LifeOS provides a simulated agent runtime alongside the full Streamable HTTP MCP server to enable immediate, standalone reviewer verification without proprietary partner credentials.
- **Zero Unverified Claims**: We do not claim direct consumer deployment on Amazon Echo hardware; the project is demonstrated via the official MCP specification, standard HTTP endpoints, and Next.js interface.

### Performance & Scalability
- **Connection Pools**: Serverless PostgreSQL requires pooled connections (`pgbouncer=true`). Unpooled cold starts may incur 1–2 second latency.
- **LLM Rate Limits**: Free tier Gemini Flash keys enforce 15 RPM. Production deployments should use enterprise quotas or local fallback mock adapters (`LLM_PROVIDER=mock`).

---

## Hackathon Submission & Friction Log

### Devpost Submission Fields

- **Project Title**: LifeOS — Autonomous Planning & Disruption Agent
- **Tagline**: Disruption-resilient daily planner powered by Model Context Protocol (MCP) Streamable HTTP transport and deterministic scheduling algorithms.
- **Track**: Smart Productivity / Daily Planning & Agentic Tool Execution
- **Built With**: TypeScript, Node.js, Express, Next.js 16, React 19, Tailwind CSS, Prisma ORM, PostgreSQL (Neon), Model Context Protocol SDK, Google Gemini 2.0 Flash, Docker.
- **Repository Visibility**: Public (GitHub) with MIT License.
- **Demo Video**: Hosted on YouTube/Vimeo (duration: 2m 50s, strictly < 3 minutes).

### Developer Friction Log (Feedback for Amazon & MCP Teams)

1. **Streamable HTTP Specification Transitions**:
   - *Friction*: Early MCP documentation referenced Server-Sent Events (SSE) as the primary HTTP transport, whereas current tools expect chunked Streamable HTTP (`POST` with streaming JSON-RPC responses).
   - *Resolution*: Implemented dual content negotiation handling both `application/json` and `text/event-stream` headers seamlessly.
2. **Interactive Transactions with Serverless Databases**:
   - *Friction*: Interactive Prisma transactions (`prisma.$transaction(async (tx) => ...)`) on serverless PostgreSQL (Neon) occasionally encountered socket timeouts during multi-step batch item creation.
   - *Resolution*: Refactored plan commitment to use nested relational writes (`prisma.plan.create({ data: { items: { createMany: ... } } })`), completing the operation in a single atomic SQL statement under 80ms.
3. **Negation Detection in Conversational Approval**:
   - *Friction*: When users responded with negative statements ("Don't approve this proposal yet"), standard tool-calling models occasionally triggered `commit_plan` prematurely.
   - *Resolution*: Hardened the agent system prompt and input guardrails with explicit negation detection, requiring unambiguous user assent before invoking destructive or state-changing tools.

---

## License

This project is licensed under the [MIT License](LICENSE).
