import { prisma, resolveUserId } from "../db/client.js";
import { FocusSessionStatus } from "@prisma/client";
import { completeTask } from "./taskService.js";

export interface StartFocusSessionInput {
  userId?: string;
  taskId?: string;
  notes?: string;
}

export interface CompleteFocusSessionInput {
  sessionId: string;
  userId?: string;
  notes?: string;
  markTaskComplete?: boolean;
}

/**
 * Starts a live deep work / focus session.
 */
export async function startFocusSession(input: StartFocusSessionInput) {
  const userId = await resolveUserId(input.userId);

  return prisma.$transaction(async (tx) => {
    // Check if an active session already exists for this user, mark abandoned if so
    await tx.focusSession.updateMany({
      where: { userId, status: FocusSessionStatus.ACTIVE },
      data: { status: FocusSessionStatus.ABANDONED, endTime: new Date() },
    });

    const session = await tx.focusSession.create({
      data: {
        userId,
        taskId: input.taskId || null,
        startTime: new Date(),
        status: FocusSessionStatus.ACTIVE,
        interruptionsCount: 0,
        notes: input.notes?.trim() || null,
      },
      include: {
        task: {
          select: { id: true, title: true, duration: true, priority: true },
        },
      },
    });

    await tx.actionHistory.create({
      data: {
        userId,
        actionType: "START_FOCUS_SESSION",
        entityType: "FOCUS_SESSION",
        entityId: session.id,
        payload: {
          taskId: session.taskId,
          startTime: session.startTime.toISOString(),
        },
      },
    });

    return session;
  });
}

/**
 * Records an interruption during an active focus session.
 */
export async function recordInterruption(
  sessionId: string,
  userIdArg?: string,
  reason?: string
) {
  const userId = await resolveUserId(userIdArg);

  const session = await prisma.focusSession.findFirst({
    where: { id: sessionId, userId, status: FocusSessionStatus.ACTIVE },
  });

  if (!session) {
    throw new Error(`Active focus session not found with id: ${sessionId}`);
  }

  const updatedNotes = reason
    ? (session.notes ? `${session.notes} | Interruption: ${reason}` : `Interruption: ${reason}`)
    : session.notes;

  return prisma.focusSession.update({
    where: { id: sessionId },
    data: {
      interruptionsCount: { increment: 1 },
      notes: updatedNotes,
    },
  });
}

/**
 * Completes a focus session, recording actual duration and optionally completing the task.
 */
export async function completeFocusSession(input: CompleteFocusSessionInput) {
  const userId = await resolveUserId(input.userId);
  const now = new Date();

  const session = await prisma.focusSession.findFirst({
    where: { id: input.sessionId, userId },
  });

  if (!session) {
    throw new Error(`Focus session not found with id: ${input.sessionId}`);
  }

  const durationMinutes = Math.max(
    1,
    Math.round((now.getTime() - new Date(session.startTime).getTime()) / (60 * 1000))
  );

  const updated = await prisma.$transaction(async (tx) => {
    const finalNotes = input.notes
      ? (session.notes ? `${session.notes} | ${input.notes}` : input.notes)
      : session.notes;

    const s = await tx.focusSession.update({
      where: { id: input.sessionId },
      data: {
        endTime: now,
        durationMinutes,
        status: FocusSessionStatus.COMPLETED,
        notes: finalNotes,
      },
      include: { task: true },
    });

    await tx.actionHistory.create({
      data: {
        userId,
        actionType: "COMPLETE_FOCUS_SESSION",
        entityType: "FOCUS_SESSION",
        entityId: s.id,
        payload: {
          durationMinutes,
          interruptions: s.interruptionsCount,
          taskId: s.taskId,
        },
      },
    });

    return s;
  });

  if (input.markTaskComplete && session.taskId) {
    try {
      await completeTask(session.taskId, userId);
    } catch {
      // non-blocking if already completed
    }
  }

  return updated;
}

/**
 * Lists focus sessions for a user.
 */
export async function listFocusSessions(userIdArg?: string, limit: number = 20) {
  const userId = await resolveUserId(userIdArg);
  return prisma.focusSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      task: {
        select: { id: true, title: true, priority: true },
      },
    },
  });
}
