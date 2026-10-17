import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/client.js";
import { getPreferences, updatePreferences } from "../src/services/preferenceService.js";

const TEST_USER_ID = "test-user-pref-001";

test.before(async () => {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      email: "pref_tester@lifeos.local",
      name: "Pref Tester",
      timezone: "Asia/Kolkata",
    },
  });
  await prisma.userPreference.deleteMany({ where: { userId: TEST_USER_ID } });
});

test.after(async () => {
  await prisma.userPreference.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

test("getPreferences initializes default preferences when none exist", async () => {
  const prefs = await getPreferences(TEST_USER_ID);
  assert.equal(prefs.focusMinutes, 45);
  assert.equal(prefs.breakMinutes, 10);
  assert.equal(prefs.workStartTime, "09:00");
  assert.equal(prefs.workEndTime, "18:00");
  assert.equal(prefs.bufferMinutes, 5);
  assert.equal(prefs.timezone, "Asia/Kolkata");
});

test("updatePreferences updates scheduling parameters and records history", async () => {
  const updated = await updatePreferences({
    userId: TEST_USER_ID,
    focusMinutes: 50,
    breakMinutes: 15,
    workStartTime: "08:30",
    workEndTime: "17:30",
    bufferMinutes: 10,
    timezone: "Asia/Kolkata",
  });

  assert.equal(updated.focusMinutes, 50);
  assert.equal(updated.breakMinutes, 15);
  assert.equal(updated.workStartTime, "08:30");
  assert.equal(updated.workEndTime, "17:30");
  assert.equal(updated.bufferMinutes, 10);
  assert.equal(updated.timezone, "Asia/Kolkata");

  // Verify ActionHistory
  const history = await prisma.actionHistory.findFirst({
    where: {
      userId: TEST_USER_ID,
      actionType: "UPDATE_PREFERENCES",
    },
  });
  assert.ok(history);
});

test("updatePreferences validates bounds and rejects invalid inputs", async () => {
  // Focus minutes out of bounds (< 5)
  await assert.rejects(
    async () => {
      await updatePreferences({
        userId: TEST_USER_ID,
        focusMinutes: 2,
      });
    },
    { message: /focusMinutes must be between 5 and 240/ }
  );

  // Invalid workStartTime format
  await assert.rejects(
    async () => {
      await updatePreferences({
        userId: TEST_USER_ID,
        workStartTime: "9am",
      });
    },
    { message: /workStartTime must be in HH:MM/ }
  );
});
