import test from "node:test";
import assert from "node:assert/strict";
import { TaskPriority, TaskStatus } from "@prisma/client";
import { prisma } from "../src/db/client.js";
import {
  createTask,
  listTasks,
  updateTask,
  completeTask,
  deleteTask,
  TaskNotFoundError,
} from "../src/services/taskService.js";

const TEST_USER_ID = "test-user-tasks-001";

test.before(async () => {
  // Setup clean test user
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      email: "task_tester@lifeos.local",
      name: "Task Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.task.deleteMany({ where: { userId: TEST_USER_ID } });
});

test.after(async () => {
  await prisma.task.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.actionHistory.deleteMany({ where: { userId: TEST_USER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.$disconnect();
});

test("createTask creates task with default fields and records history", async () => {
  const task = await createTask({
    userId: TEST_USER_ID,
    title: "Write hackathon pitch",
  });

  assert.ok(task.id);
  assert.equal(task.title, "Write hackathon pitch");
  assert.equal(task.duration, 30);
  assert.equal(task.priority, TaskPriority.MEDIUM);
  assert.equal(task.status, TaskStatus.PENDING);
  assert.deepEqual(task.tags, []);

  // Verify history
  const history = await prisma.actionHistory.findFirst({
    where: { userId: TEST_USER_ID, actionType: "CREATE_TASK", entityId: task.id },
  });
  assert.ok(history);
});

test("createTask validates positive duration and handles optional fields", async () => {
  const deadline = new Date("2026-10-20T12:00:00.000Z");
  const task = await createTask({
    userId: TEST_USER_ID,
    title: "Architecture sync",
    description: "Align with Alexa team",
    duration: 60,
    priority: TaskPriority.HIGH,
    deadline,
    tags: ["architecture", "alexa"],
  });

  assert.equal(task.duration, 60);
  assert.equal(task.priority, TaskPriority.HIGH);
  assert.equal(task.description, "Align with Alexa team");
  assert.deepEqual(task.tags, ["architecture", "alexa"]);
  assert.equal(task.deadline?.toISOString(), deadline.toISOString());

  // Negative duration error
  await assert.rejects(
    async () => {
      await createTask({
        userId: TEST_USER_ID,
        title: "Invalid task",
        duration: -10,
      });
    },
    { message: /Task duration must be a positive integer/ }
  );
});

test("listTasks filters by status, priority, and tags", async () => {
  const tasks = await listTasks({ userId: TEST_USER_ID });
  assert.equal(tasks.length, 2);

  // Filter by priority
  const highTasks = await listTasks({
    userId: TEST_USER_ID,
    priority: TaskPriority.HIGH,
  });
  assert.equal(highTasks.length, 1);
  assert.equal(highTasks[0].title, "Architecture sync");

  // Filter by tag
  const alexaTasks = await listTasks({
    userId: TEST_USER_ID,
    tag: "alexa",
  });
  assert.equal(alexaTasks.length, 1);
});

test("updateTask updates fields and tracks completedAt", async () => {
  const created = await createTask({
    userId: TEST_USER_ID,
    title: "Draft speech",
    duration: 20,
  });

  const updated = await updateTask({
    id: created.id,
    userId: TEST_USER_ID,
    title: "Draft keynote speech",
    priority: TaskPriority.URGENT,
    duration: 45,
    status: TaskStatus.IN_PROGRESS,
  });

  assert.equal(updated.title, "Draft keynote speech");
  assert.equal(updated.priority, TaskPriority.URGENT);
  assert.equal(updated.duration, 45);
  assert.equal(updated.status, TaskStatus.IN_PROGRESS);
  assert.equal(updated.completedAt, null);
});

test("completeTask marks status COMPLETED and records completedAt", async () => {
  const created = await createTask({
    userId: TEST_USER_ID,
    title: "Submit devpost form",
  });

  const completed = await completeTask(created.id, TEST_USER_ID);
  assert.equal(completed.status, TaskStatus.COMPLETED);
  assert.ok(completed.completedAt instanceof Date);

  // Listing pending should now omit completed task
  const pending = await listTasks({
    userId: TEST_USER_ID,
    status: TaskStatus.PENDING,
  });
  assert.ok(!pending.some((t) => t.id === created.id));
});

test("deleteTask removes task and handles non-existent IDs", async () => {
  const created = await createTask({
    userId: TEST_USER_ID,
    title: "Temporary scratch task",
  });

  const result = await deleteTask(created.id, TEST_USER_ID);
  assert.equal(result.success, true);
  assert.equal(result.id, created.id);

  // Verify deleted from DB
  const check = await prisma.task.findUnique({ where: { id: created.id } });
  assert.equal(check, null);

  // Deleting again should throw TaskNotFoundError
  await assert.rejects(
    async () => {
      await deleteTask(created.id, TEST_USER_ID);
    },
    (err: Error) => err instanceof TaskNotFoundError
  );
});
