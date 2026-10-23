import { Prisma, UserPreference } from "@prisma/client";
import { prisma, resolveUserId } from "../db/client.js";

export interface UpdatePreferencesInput {
  userId?: string;
  focusMinutes?: number;
  breakMinutes?: number;
  workStartTime?: string;
  workEndTime?: string;
  bufferMinutes?: number;
  timezone?: string;
}

export interface UserPreferencesWithTimezone extends UserPreference {
  timezone: string;
}

export async function getPreferences(userId?: string): Promise<UserPreferencesWithTimezone> {
  const targetUserId = await resolveUserId(userId);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { preferences: true },
  });

  if (!user) {
    throw new Error(`User not found: ${targetUserId}`);
  }

  // If preferences row does not exist yet, initialize it
  if (!user.preferences) {
    const createdPref = await prisma.userPreference.create({
      data: {
        userId: user.id,
        focusMinutes: 45,
        breakMinutes: 10,
        workStartTime: "09:00",
        workEndTime: "18:00",
        bufferMinutes: 5,
      },
    });
    return { ...createdPref, timezone: user.timezone };
  }

  return { ...user.preferences, timezone: user.timezone };
}

export async function updatePreferences(
  input: UpdatePreferencesInput
): Promise<UserPreferencesWithTimezone> {
  const targetUserId = await resolveUserId(input.userId);

  return prisma.$transaction(async (tx) => {
    // Validate bounds
    if (input.focusMinutes !== undefined && (input.focusMinutes < 5 || input.focusMinutes > 240)) {
      throw new Error("focusMinutes must be between 5 and 240 minutes.");
    }
    if (input.breakMinutes !== undefined && (input.breakMinutes < 1 || input.breakMinutes > 120)) {
      throw new Error("breakMinutes must be between 1 and 120 minutes.");
    }
    if (input.bufferMinutes !== undefined && (input.bufferMinutes < 0 || input.bufferMinutes > 60)) {
      throw new Error("bufferMinutes must be between 0 and 60 minutes.");
    }
    if (input.workStartTime && !/^\d{2}:\d{2}$/.test(input.workStartTime)) {
      throw new Error("workStartTime must be in HH:MM 24-hour format.");
    }
    if (input.workEndTime && !/^\d{2}:\d{2}$/.test(input.workEndTime)) {
      throw new Error("workEndTime must be in HH:MM 24-hour format.");
    }
    if (input.workStartTime && input.workEndTime && input.workStartTime >= input.workEndTime) {
      throw new Error("workStartTime must be earlier than workEndTime.");
    }

    const prefData: Record<string, number | string> = {};
    if (input.focusMinutes !== undefined) prefData.focusMinutes = input.focusMinutes;
    if (input.breakMinutes !== undefined) prefData.breakMinutes = input.breakMinutes;
    if (input.workStartTime !== undefined) prefData.workStartTime = input.workStartTime;
    if (input.workEndTime !== undefined) prefData.workEndTime = input.workEndTime;
    if (input.bufferMinutes !== undefined) prefData.bufferMinutes = input.bufferMinutes;

    const updatedPref = await tx.userPreference.upsert({
      where: { userId: targetUserId },
      update: prefData,
      create: {
        userId: targetUserId,
        focusMinutes: input.focusMinutes ?? 45,
        breakMinutes: input.breakMinutes ?? 10,
        workStartTime: input.workStartTime ?? "09:00",
        workEndTime: input.workEndTime ?? "18:00",
        bufferMinutes: input.bufferMinutes ?? 5,
      },
    });

    let timezone = "Asia/Kolkata";
    if (input.timezone) {
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { timezone: input.timezone.trim() },
        select: { timezone: true },
      });
      timezone = updatedUser.timezone;
    } else {
      const u = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { timezone: true },
      });
      if (u) timezone = u.timezone;
    }

    await tx.actionHistory.create({
      data: {
        userId: targetUserId,
        actionType: "UPDATE_PREFERENCES",
        entityType: "USER_PREFERENCE",
        entityId: updatedPref.id,
        payload: {
          updatedPreferences: prefData,
          timezone: input.timezone ?? null,
        } as Prisma.InputJsonObject,
      },
    });

    return { ...updatedPref, timezone };
  });
}
