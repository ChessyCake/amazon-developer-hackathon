-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanItemType" AS ENUM ('TASK', 'EVENT', 'BREAK', 'BUFFER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "focusMinutes" INTEGER NOT NULL DEFAULT 45,
    "breakMinutes" INTEGER NOT NULL DEFAULT 10,
    "workStartTime" TEXT NOT NULL DEFAULT '09:00',
    "workEndTime" TEXT NOT NULL DEFAULT '18:00',
    "bufferMinutes" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "itemType" "PlanItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "taskId" TEXT,
    "calendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "tasks_userId_status_idx" ON "tasks"("userId", "status");

-- CreateIndex
CREATE INDEX "tasks_userId_deadline_idx" ON "tasks"("userId", "deadline");

-- CreateIndex
CREATE INDEX "calendar_events_userId_startTime_endTime_idx" ON "calendar_events"("userId", "startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_userId_date_key" ON "plans"("userId", "date");

-- CreateIndex
CREATE INDEX "plan_items_planId_order_idx" ON "plan_items"("planId", "order");

-- CreateIndex
CREATE INDEX "action_history_userId_createdAt_idx" ON "action_history"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "action_history_userId_entityType_entityId_idx" ON "action_history"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_history" ADD CONSTRAINT "action_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
