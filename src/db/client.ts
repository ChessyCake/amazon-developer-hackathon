import "dotenv/config";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export const DEFAULT_USER_ID = process.env.DEMO_USER_ID ?? "demo-user-001";
export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE ?? "Asia/Kolkata";

/**
 * Resolves a valid user ID, defaulting to the demo user if not supplied.
 * Ensures the target user exists or is initialized with default preferences.
 */
export async function resolveUserId(userId?: string): Promise<string> {
  const targetId = userId?.trim() || DEFAULT_USER_ID;

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });

  if (!existing) {
    // If the demo user was requested but not yet seeded, auto-provision
    if (targetId === DEFAULT_USER_ID) {
      const user = await prisma.user.create({
        data: {
          id: DEFAULT_USER_ID,
          email: process.env.DEMO_USER_EMAIL ?? "demo@lifeos.local",
          name: "Demo Planner",
          timezone: DEFAULT_TIMEZONE,
          preferences: {
            create: {
              focusMinutes: 45,
              breakMinutes: 10,
              workStartTime: "09:00",
              workEndTime: "18:00",
              bufferMinutes: 5,
            },
          },
        },
      });
      return user.id;
    }
    throw new Error(`User not found with id: ${targetId}`);
  }

  return targetId;
}
