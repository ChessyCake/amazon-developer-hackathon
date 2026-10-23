import { Router, Request, Response } from "express";
import { prisma, resolveUserId } from "../db/client.js";
import { getDayContext } from "../services/contextService.js";
import {
  createTask,
  listTasks,
  updateTask,
  completeTask,
  deleteTask,
} from "../services/taskService.js";
import { getPreferences, updatePreferences } from "../services/preferenceService.js";
import {
  generateAndSavePlan,
  getPlan,
  approvePlan,
} from "../services/planService.js";
import {
  previewReplan,
  comparePlansService,
  commitPlan,
  rejectPlan,
  getPlanHistory,
  rollbackPlan,
} from "../services/replanService.js";
import { runAgent } from "../agent/agentLoop.js";
import { TaskPriority, TaskStatus, PlanStatus } from "@prisma/client";

const router = Router();

// 1. Context Endpoint
router.get("/context", async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const userId = req.query.userId as string | undefined;
    const context = await getDayContext(date, userId);
    res.json({ success: true, context });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 2. Task Management Endpoints
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const { status, priority, tag, search, userId } = req.query;
    const tasks = await listTasks({
      status: status as TaskStatus,
      priority: priority as TaskPriority,
      tag: tag as string,
      search: search as string,
      userId: userId as string,
    });
    res.json({ success: true, tasks });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const task = await createTask(req.body);
    res.status(201).json({ success: true, task });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.body.userId || req.query.userId) as string | undefined;
    const task = await updateTask({ id, ...req.body, userId });
    res.json({ success: true, task });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/tasks/:id/complete", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const task = await completeTask(id, userId);
    res.json({ success: true, task });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId as string | undefined;
    const result = await deleteTask(id, userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 3. Preferences Endpoints
router.get("/preferences", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const preferences = await getPreferences(userId);
    res.json({ success: true, preferences });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put("/preferences", async (req: Request, res: Response) => {
  try {
    const { userId, ...data } = req.body;
    const preferences = await updatePreferences(userId, data);
    res.json({ success: true, preferences });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 4. Plan Management Endpoints
router.get("/plans", async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const userId = req.query.userId as string | undefined;
    const { plan } = await getPlan(date, userId);
    res.json({ success: true, plan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/plans/generate", async (req: Request, res: Response) => {
  try {
    const { date, overwriteApproved, userId } = req.body;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ success: false, error: "Field 'date' in YYYY-MM-DD format is required." });
      return;
    }
    const result = await generateAndSavePlan({
      date,
      overwriteApproved: !!overwriteApproved,
      userId,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/plans/approve", async (req: Request, res: Response) => {
  try {
    const { planId, userId } = req.body;
    if (!planId || typeof planId !== "string" || planId.trim() === "") {
      res.status(400).json({ success: false, error: "Field 'planId' is required." });
      return;
    }
    const result = await approvePlan(planId, userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 5. Adaptive Replanning Endpoints (Stage 4)
router.post("/plans/replan/preview", async (req: Request, res: Response) => {
  try {
    const { date, delayedEvents, extendedTasks, preservedTaskIds, pinnedTaskIds, reason, whatIf, userId } = req.body;
    const result = await previewReplan({
      date,
      userId,
      disruptions: {
        delayedEvents,
        extendedTasks,
        reason,
      },
      constraints: {
        preservedTaskIds,
        pinnedTaskIds,
      },
      whatIf,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/plans/replan/compare", async (req: Request, res: Response) => {
  try {
    const { basePlanId, targetPlanId, userId } = req.body;
    const diff = await comparePlansService({
      basePlanId,
      targetPlanId,
      userId,
    });
    res.json({ success: true, diff });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/plans/replan/commit", async (req: Request, res: Response) => {
  try {
    const { planId, expectedVersion, userId } = req.body;
    if (!planId || typeof planId !== "string" || planId.trim() === "") {
      res.status(400).json({ success: false, error: "Field 'planId' is required." });
      return;
    }
    const result = await commitPlan({
      planId,
      expectedVersion,
      userId,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/plans/replan/reject", async (req: Request, res: Response) => {
  try {
    const { planId, reason, userId } = req.body;
    if (!planId || typeof planId !== "string" || planId.trim() === "") {
      res.status(400).json({ success: false, error: "Field 'planId' is required." });
      return;
    }
    const result = await rejectPlan({
      planId,
      reason,
      userId,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get("/plans/history", async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const userId = req.query.userId as string | undefined;
    const history = await getPlanHistory(date, userId);
    res.json({ success: true, ...history });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/plans/replan/rollback", async (req: Request, res: Response) => {
  try {
    const { date, targetVersion, reason, userId } = req.body;
    const result = await rollbackPlan({
      date,
      targetVersion,
      reason,
      userId,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 6. Conversational AI Agent Endpoint
router.post("/agent/chat", async (req: Request, res: Response) => {
  try {
    const { message, conversationId, userId, date } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ success: false, error: "Field 'message' is required." });
      return;
    }
    const result = await runAgent(message, {
      conversationId,
      userId,
      date,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Activity History Feed
router.get("/activity", async (req: Request, res: Response) => {
  try {
    const targetUserId = await resolveUserId(req.query.userId as string | undefined);
    const limit = Number(req.query.limit || 50);

    const activities = await prisma.actionHistory.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ success: true, activities });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 8. One-click Demo Baseline Seeder (For Judges)
router.post("/seed-demo", async (req: Request, res: Response) => {
  try {
    const targetUserId = await resolveUserId(req.body.userId);
    const date = req.body.date || "2026-10-22";

    // Reset user state
    await prisma.planItem.deleteMany({ where: { plan: { userId: targetUserId } } });
    await prisma.plan.deleteMany({ where: { userId: targetUserId } });
    await prisma.calendarEvent.deleteMany({ where: { userId: targetUserId } });
    await prisma.task.deleteMany({ where: { userId: targetUserId } });
    await prisma.actionHistory.deleteMany({ where: { userId: targetUserId } });

    // Seed preferences
    await prisma.userPreference.upsert({
      where: { userId: targetUserId },
      update: {
        workStartTime: "09:00",
        workEndTime: "18:00",
        focusMinutes: 60,
        breakMinutes: 10,
        bufferMinutes: 5,
      },
      create: {
        userId: targetUserId,
        workStartTime: "09:00",
        workEndTime: "18:00",
        focusMinutes: 60,
        breakMinutes: 10,
        bufferMinutes: 5,
      },
    });

    // Seed Chemistry Lab fixed event
    const labEvent = await prisma.calendarEvent.create({
      data: {
        userId: targetUserId,
        title: "Chemistry Lab",
        startTime: new Date(`${date}T10:00:00+05:30`),
        endTime: new Date(`${date}T12:00:00+05:30`),
      },
    });

    // Seed tasks
    const osTask = await prisma.task.create({
      data: {
        userId: targetUserId,
        title: "Operating Systems Assignment",
        duration: 60,
        priority: TaskPriority.HIGH,
        tags: ["academic", "cs"],
      },
    });

    const examTask = await prisma.task.create({
      data: {
        userId: targetUserId,
        title: "Exam preparation",
        duration: 90,
        priority: TaskPriority.HIGH,
        tags: ["academic", "exam"],
      },
    });

    const dsaTask = await prisma.task.create({
      data: {
        userId: targetUserId,
        title: "DSA practice",
        duration: 60,
        priority: TaskPriority.MEDIUM,
        tags: ["coding", "interview"],
      },
    });

    // Generate and approve baseline plan
    const generated = await generateAndSavePlan({ date, userId: targetUserId });
    await approvePlan(generated.planId, targetUserId);

    res.json({
      success: true,
      message: "Demo baseline initialized with Chemistry Lab, OS Assignment, Exam Prep, and DSA Practice.",
      labEventId: labEvent.id,
      tasks: [osTask, examTask, dsaTask],
      planId: generated.planId,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// STAGE 6: ADVANCED PRODUCTIVITY API ROUTES
// ==========================================

import {
  createGoal,
  listGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  decomposeGoal,
} from "../services/goalService.js";
import { analyzeDeadlineRisks } from "../services/riskAnalysisService.js";
import {
  createRecurringRule,
  listRecurringRules,
  generateRecurringTasks,
  deleteRecurringRule,
} from "../services/recurringService.js";
import { getDailyBriefing } from "../services/briefingService.js";
import { simulateWhatIfPlans } from "../services/whatIfService.js";
import { getWeeklyReview } from "../services/reviewService.js";
import {
  startFocusSession,
  recordInterruption,
  completeFocusSession,
  listFocusSessions,
} from "../services/focusSessionService.js";

// 1. Goals & Decomposition
router.get("/goals", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const status = req.query.status as any;
    const goals = await listGoals(userId, status);
    res.json({ success: true, goals });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/goals", async (req: Request, res: Response) => {
  try {
    const goal = await createGoal(req.body);
    res.status(201).json({ success: true, goal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get("/goals/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const goal = await getGoal(req.params.id, userId);
    res.json({ success: true, goal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch("/goals/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.body.userId || req.query.userId) as string | undefined;
    const goal = await updateGoal(req.params.id, req.body, userId);
    res.json({ success: true, goal });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete("/goals/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const result = await deleteGoal(req.params.id, userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/goals/:id/decompose", async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const result = await decomposeGoal({
      goalId: req.params.id,
      userId,
      milestones: req.body.milestones,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 2. Deadline Risk Analysis
router.get("/risks", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const asOfDate = req.query.asOfDate as string | undefined;
    const lookaheadDays = req.query.lookaheadDays
      ? parseInt(req.query.lookaheadDays as string, 10)
      : undefined;
    const report = await analyzeDeadlineRisks(userId, { asOfDate, lookaheadDays });
    res.json({ success: true, report });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 3. Recurring Routines
router.get("/recurring", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const rules = await listRecurringRules(userId);
    res.json({ success: true, rules });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/recurring", async (req: Request, res: Response) => {
  try {
    const rule = await createRecurringRule(req.body);
    res.status(201).json({ success: true, rule });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/recurring/generate", async (req: Request, res: Response) => {
  try {
    const { userId, date, horizonDays } = req.body;
    const result = await generateRecurringTasks(userId, date, horizonDays);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete("/recurring/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const result = await deleteRecurringRule(req.params.id, userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 4. Daily Briefing
router.get("/briefing", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const date = req.query.date as string | undefined;
    const briefing = await getDailyBriefing(userId, date);
    res.json({ success: true, briefing });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 5. What-If Planning Simulation
router.get("/plans/what-if", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const date = req.query.date as string | undefined;
    const report = await simulateWhatIfPlans(userId, date);
    res.json({ success: true, report });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 6. Weekly Review
router.get("/review/weekly", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const weekStartDate = req.query.weekStartDate as string | undefined;
    const review = await getWeeklyReview(userId, weekStartDate);
    res.json({ success: true, review });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 7. Focus Sessions
router.post("/focus-sessions/start", async (req: Request, res: Response) => {
  try {
    const session = await startFocusSession(req.body);
    res.status(201).json({ success: true, session });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/focus-sessions/:id/interruption", async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const session = await recordInterruption(req.params.id, userId, req.body.reason);
    res.json({ success: true, session });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/focus-sessions/:id/complete", async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const session = await completeFocusSession({
      sessionId: req.params.id,
      userId,
      notes: req.body.notes,
      markTaskComplete: req.body.markTaskComplete,
    });
    res.json({ success: true, session });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get("/focus-sessions", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const sessions = await listFocusSessions(userId, limit);
    res.json({ success: true, sessions });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export { router as apiRouter };

