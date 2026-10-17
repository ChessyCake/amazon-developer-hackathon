import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/db/client.js";
import {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
  TaskNotFoundError,
} from "../src/services/taskService.js";
import { getDayContext } from "../src/services/contextService.js";

const USER_ALICE = "user-alice-001";
const USER_BOB = "user-bob-002";

test.before(async () => {
  // Create Alice
  await prisma.user.upsert({
    where: { id: USER_ALICE },
    update: {},
    create: {
      id: USER_ALICE,
      email: "alice@lifeos.local",
      name: "Alice",
      timezone: "Asia/Kolkata",
      preferences: {
        create: {
          focusMinutes: 50,
          breakMinutes: 10,
        },
      },
    },
  });

  // Create Bob
  await prisma.user.upsert({
    where: { id: USER_BOB },
    update: {},
    create: {
      id: USER_BOB,
      email: "bob@lifeos.local",
      name: "Bob",
      timezone: "Asia/Kolkata",
      preferences: {
        create: {
          focusMinutes: 25,
          breakMinutes: 5,
        },
      },
    },
  });

  await prisma.task.deleteMany({
    where: { userId: { in: [USER_ALICE, USER_BOB] } },
  });
});

test.after(async () => {
  await prisma.task.deleteMany({
    where: { userId: { in: [USER_ALICE, USER_BOB] } },
  });
  await prisma.calendarEvent.deleteMany({
    where: { userId: { in: [USER_ALICE, USER_BOB] } },
  });
  await prisma.actionHistory.deleteMany({
    where: { userId: { in: [USER_ALICE, USER_BOB] } },
  });
  await prisma.userPreference.deleteMany({
    where: { userId: { in: [USER_ALICE, USER_BOB] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [USER_ALICE, USER_BOB] } },
  });
  await prisma.$disconnect();
});

test("enforces strict user ownership: User B cannot view User A's tasks", async () => {
  const aliceTask = await createTask({
    userId: USER_ALICE,
    title: "Alice's Secret Project",
  });

  const bobTasks = await listTasks({ userId: USER_BOB });
  assert.equal(bobTasks.length, 0, "Bob should see zero tasks");

  const aliceTasks = await listTasks({ userId: USER_ALICE });
  assert.equal(aliceTasks.length, 1);
  assert.equal(aliceTasks[0].id, aliceTask.id);
});

test("enforces strict user ownership: User B cannot update User A's tasks", async () => {
  const aliceTask = await createTask({
    userId: USER_ALICE,
    title: "Alice's Presentation",
  });

  await assert.rejects(
    async () => {
      await updateTask({
        id: aliceTask.id,
        userId: USER_BOB, // Bob attempts to update Alice's task
        title: "Bob Hacked This",
      });
    },
    (err: Error) => err instanceof TaskNotFoundError
  );

  // Verify task remains untouched
  const verified = await prisma.task.findUnique({ where: { id: aliceTask.id } });
  assert.equal(verified?.title, "Alice's Presentation");
});

test("enforces strict user ownership: User B cannot delete User A's tasks", async () => {
  const aliceTask = await createTask({
    userId: USER_ALICE,
    title: "Alice's Key Document",
  });

  await assert.rejects(
    async () => {
      await deleteTask(aliceTask.id, USER_BOB); // Bob attempts to delete
    },
    (err: Error) => err instanceof TaskNotFoundError
  );

  const verified = await prisma.task.findUnique({ where: { id: aliceTask.id } });
  assert.ok(verified, "Alice's task must still exist");
});

test("getDayContext enforces user context and timezone isolation", async () => {
  // Add fixed event for Alice
  await prisma.calendarEvent.create({
    data: {
      userId: USER_ALICE,
      title: "Alice Private Meeting",
      startTime: new Date("2026-10-18T05:00:00.000Z"),
      endTime: new Date("2026-10-18T06:00:00.000Z"),
    },
  });

  const aliceContext = await getDayContext("2026-10-18", USER_ALICE);
  const bobContext = await getDayContext("2026-10-18", USER_BOB);

  assert.equal(aliceContext.fixedEvents.length, 1);
  assert.equal(aliceContext.fixedEvents[0].title, "Alice Private Meeting");
  assert.equal(aliceContext.preferences.focusMinutes, 50);

  assert.equal(bobContext.fixedEvents.length, 0);
  assert.equal(bobContext.preferences.focusMinutes, 25);
});
