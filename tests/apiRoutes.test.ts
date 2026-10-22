import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../server.js";
import { prisma } from "../src/db/client.js";
import { createServer } from "node:http";

const TEST_API_USER = "test-api-user-001";
const TEST_DATE = "2026-10-22";

let serverInstance: any;
let baseUrl = "";

test.before(async () => {
  // Start server on an ephemeral port for testing
  await new Promise<void>((resolve) => {
    serverInstance = createServer(app);
    serverInstance.listen(0, "127.0.0.1", () => {
      const address = serverInstance.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  await prisma.user.upsert({
    where: { id: TEST_API_USER },
    update: {},
    create: {
      id: TEST_API_USER,
      email: "api_tester@lifeos.local",
      name: "API Tester",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_API_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_API_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_API_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_API_USER } });
});

test.after(async () => {
  await prisma.planItem.deleteMany({ where: { plan: { userId: TEST_API_USER } } });
  await prisma.plan.deleteMany({ where: { userId: TEST_API_USER } });
  await prisma.task.deleteMany({ where: { userId: TEST_API_USER } });
  await prisma.calendarEvent.deleteMany({ where: { userId: TEST_API_USER } });
  await prisma.user.deleteMany({ where: { id: TEST_API_USER } });
  if (serverInstance) {
    await new Promise<void>((resolve) => serverInstance.close(resolve));
  }
  await prisma.$disconnect();
});

test("API: GET /api/context returns valid day context", async () => {
  const res = await fetch(`${baseUrl}/api/context?date=${TEST_DATE}&userId=${TEST_API_USER}`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.context.date, TEST_DATE);
  assert.equal(data.context.timezone, "Asia/Kolkata");
  assert.ok(Array.isArray(data.context.fixedEvents));
  assert.ok(Array.isArray(data.context.pendingTasks));
});

test("API: Task CRUD operations via REST API", async () => {
  // 1. Create task
  const createRes = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Write documentation",
      duration: 45,
      priority: "HIGH",
      userId: TEST_API_USER,
    }),
  });
  assert.equal(createRes.status, 201);
  const createData = await createRes.json();
  assert.equal(createData.success, true);
  const taskId = createData.task.id;
  assert.equal(createData.task.title, "Write documentation");

  // 2. List tasks
  const listRes = await fetch(`${baseUrl}/api/tasks?userId=${TEST_API_USER}`);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.success, true);
  assert.ok(listData.tasks.some((t: any) => t.id === taskId));

  // 3. Update task
  const updateRes = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ duration: 60, userId: TEST_API_USER }),
  });
  assert.equal(updateRes.status, 200);
  const updateData = await updateRes.json();
  assert.equal(updateData.task.duration, 60);

  // 4. Complete task
  const completeRes = await fetch(`${baseUrl}/api/tasks/${taskId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: TEST_API_USER }),
  });
  assert.equal(completeRes.status, 200);
  const completeData = await completeRes.json();
  assert.equal(completeData.task.status, "COMPLETED");

  // 5. Delete task
  const deleteRes = await fetch(`${baseUrl}/api/tasks/${taskId}?userId=${TEST_API_USER}`, {
    method: "DELETE",
  });
  assert.equal(deleteRes.status, 200);
});

test("API: Preferences GET and PUT", async () => {
  const getRes = await fetch(`${baseUrl}/api/preferences?userId=${TEST_API_USER}`);
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.success, true);
  assert.ok(getData.preferences);

  const putRes = await fetch(`${baseUrl}/api/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: TEST_API_USER,
      focusMinutes: 50,
      breakMinutes: 10,
    }),
  });
  assert.equal(putRes.status, 200);
  const putData = await putRes.json();
  assert.equal(putData.preferences.focusMinutes, 50);
});

test("API: One-click Demo Baseline Seeder & Replan Workflow", async () => {
  // 1. Seed demo baseline
  const seedRes = await fetch(`${baseUrl}/api/seed-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: TEST_API_USER, date: TEST_DATE }),
  });
  assert.equal(seedRes.status, 200);
  const seedData = await seedRes.json();
  assert.equal(seedData.success, true);
  assert.ok(seedData.labEventId);

  // 2. Fetch active baseline plan
  const planRes = await fetch(`${baseUrl}/api/plans?date=${TEST_DATE}&userId=${TEST_API_USER}`);
  assert.equal(planRes.status, 200);
  const planData = await planRes.json();
  assert.equal(planData.plan.status, "ACTIVE");
  assert.equal(planData.plan.version, 1);

  // 3. Request replan preview
  const previewRes = await fetch(`${baseUrl}/api/plans/replan/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: TEST_DATE,
      userId: TEST_API_USER,
      delayedEvents: [{ eventId: seedData.labEventId, title: "Chemistry Lab", delayMinutes: 60 }],
      preservedTaskIds: ["Exam preparation"],
      reason: "Lab ran 1 hour late",
    }),
  });
  assert.equal(previewRes.status, 200);
  const previewData = await previewRes.json();
  assert.equal(previewData.success, true);
  assert.equal(previewData.proposedVersion, 2);
  assert.ok(previewData.diff.moved.length > 0);

  // Original plan must remain ACTIVE
  const checkActiveRes = await fetch(`${baseUrl}/api/plans?date=${TEST_DATE}&userId=${TEST_API_USER}`);
  const checkActiveData = await checkActiveRes.json();
  assert.equal(checkActiveData.plan.version, 1);
  assert.equal(checkActiveData.plan.status, "ACTIVE");

  // 4. Commit replan proposal
  const commitRes = await fetch(`${baseUrl}/api/plans/replan/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planId: previewData.proposedPlanId,
      expectedVersion: 2,
      userId: TEST_API_USER,
    }),
  });
  assert.equal(commitRes.status, 200);
  const commitData = await commitRes.json();
  assert.equal(commitData.success, true);
  assert.equal(commitData.version, 2);

  // 5. Check history
  const historyRes = await fetch(`${baseUrl}/api/plans/history?date=${TEST_DATE}&userId=${TEST_API_USER}`);
  assert.equal(historyRes.status, 200);
  const historyData = await historyRes.json();
  assert.equal(historyData.totalVersions, 2);
  assert.equal(historyData.currentActiveVersion, 2);
});
