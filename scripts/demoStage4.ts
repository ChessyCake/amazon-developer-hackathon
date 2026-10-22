import { prisma, resolveUserId } from "../src/db/client.js";
import { TaskPriority, PlanStatus } from "@prisma/client";
import { generateAndSavePlan, approvePlan, getPlan } from "../src/services/planService.js";
import {
  previewReplan,
  commitPlan,
  getPlanHistory,
  comparePlansService,
} from "../src/services/replanService.js";

async function runStage4Demo() {
  console.log("===============================================================================");
  console.log("       LifeOS Stage 4: Adaptive Planning and Safe Execution Live Demo          ");
  console.log("===============================================================================\n");

  const DEMO_USER_ID = "demo-user-stage4";
  const DEMO_DATE = "2026-10-22";

  // Step 1: Initialize Demo User & Clean Prior State
  const user = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: "alexa_student@lifeos.local",
      name: "Alexa Hackathon Student",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.userPreference.upsert({
    where: { userId: DEMO_USER_ID },
    update: {
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 60,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
    create: {
      userId: DEMO_USER_ID,
      workStartTime: "09:00",
      workEndTime: "18:00",
      focusMinutes: 60,
      breakMinutes: 10,
      bufferMinutes: 5,
    },
  });

  // Clean prior demo items
  await prisma.planItem.deleteMany({ where: { plan: { userId: DEMO_USER_ID } } });
  await prisma.plan.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.calendarEvent.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.task.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.actionHistory.deleteMany({ where: { userId: DEMO_USER_ID } });

  console.log("[1] Setting up user schedule baseline:");
  console.log("    - Fixed Event: Chemistry Lab (10:00 - 12:00)");
  console.log("    - Task: Operating Systems Assignment (60m, HIGH)");
  console.log("    - Task: Exam preparation (90m, HIGH)");
  console.log("    - Task: DSA practice (60m, MEDIUM)");

  const labEvent = await prisma.calendarEvent.create({
    data: {
      userId: DEMO_USER_ID,
      title: "Chemistry Lab",
      startTime: new Date(`${DEMO_DATE}T10:00:00+05:30`),
      endTime: new Date(`${DEMO_DATE}T12:00:00+05:30`),
    },
  });

  await prisma.task.createMany({
    data: [
      {
        userId: DEMO_USER_ID,
        title: "Operating Systems Assignment",
        duration: 60,
        priority: TaskPriority.HIGH,
      },
      {
        userId: DEMO_USER_ID,
        title: "Exam preparation",
        duration: 90,
        priority: TaskPriority.HIGH,
      },
      {
        userId: DEMO_USER_ID,
        title: "DSA practice",
        duration: 60,
        priority: TaskPriority.MEDIUM,
      },
    ],
  });

  // Step 2: Generate and Approve Baseline Schedule (v1)
  console.log("\n[2] Generating initial schedule and committing as ACTIVE (Version 1)...");
  const initResult = await generateAndSavePlan({
    date: DEMO_DATE,
    userId: DEMO_USER_ID,
  });
  await approvePlan(initResult.planId, DEMO_USER_ID);

  const baselinePlan = (await getPlan(DEMO_DATE, DEMO_USER_ID)).plan as any;
  console.log(`    Baseline Plan ID: ${baselinePlan.id} | Status: ${baselinePlan.status} | Version: ${baselinePlan.version}`);
  console.log("    Scheduled Items:");
  for (const item of baselinePlan.items) {
    const s = new Date(item.startTime).toISOString().slice(11, 16);
    const e = new Date(item.endTime).toISOString().slice(11, 16);
    console.log(`      • [${s} - ${e}] (${item.itemType}) ${item.title}`);
  }

  // Step 3: Main Scenario Disruption
  console.log("\n[3] User reports disruption:");
  console.log('    >> "My lab ran an hour late. Replan my day, but preserve my exam preparation."');

  console.log("\n[4] Invoking 'preview_replan' MCP Service (Safety Rule: Non-destructive preview):");
  const preview = await previewReplan({
    date: DEMO_DATE,
    userId: DEMO_USER_ID,
    disruptions: {
      delayedEvents: [
        {
          eventId: labEvent.id,
          title: "Chemistry Lab",
          delayMinutes: 60, // Lab extended from 12:00 to 13:00
        },
      ],
      reason: "Lab ran an hour late",
    },
    constraints: {
      preservedTaskIds: ["Exam preparation"],
    },
  });

  // Step 4: Verify Non-destructive Behavior
  const committedCheck = (await getPlan(DEMO_DATE, DEMO_USER_ID)).plan as any;
  console.log("\n    --> Verification: Is original plan still committed and untouched during preview?");
  console.log(`        Original Plan ID: ${committedCheck.id} | Status: ${committedCheck.status} | Version: ${committedCheck.version}`);
  console.log(`        Proposal Plan ID: ${preview.proposedPlanId} | Status: PROPOSED | Version: ${preview.proposedVersion}`);

  // Step 5: Structured Diff & Trade-off Explanations
  console.log("\n[5] Structured Diff (Old Schedule vs Candidate Replan):");
  console.log(`    Summary: Added=${preview.diff.summary.totalAdded}, Moved=${preview.diff.summary.totalMoved}, Removed=${preview.diff.summary.totalRemoved}, Unchanged=${preview.diff.summary.totalUnchanged}`);

  if (preview.diff.moved.length > 0) {
    console.log("    Moved Items:");
    for (const m of preview.diff.moved) {
      const oS = m.oldStartTime ? new Date(m.oldStartTime).toISOString().slice(11, 16) : "?";
      const nS = m.newStartTime ? new Date(m.newStartTime).toISOString().slice(11, 16) : "?";
      console.log(`      ↔ '${m.title}': shifted ${m.shiftMinutes! > 0 ? `+${m.shiftMinutes}m` : `${m.shiftMinutes}m`} (${oS} -> ${nS}) | Reason: ${m.reason}`);
    }
  }

  if (preview.diff.unchanged.length > 0) {
    console.log("    Unchanged Items:");
    for (const u of preview.diff.unchanged) {
      console.log(`      ✓ '${u.title}'`);
    }
  }

  console.log("\n[6] LifeOS Trade-off Explanations:");
  for (const tradeOff of preview.tradeOffs) {
    console.log(`    ℹ ${tradeOff}`);
  }

  // Step 6: LifeOS Prompt for User Approval
  console.log("\n[7] Autonomous Execution Guardrail:");
  console.log("    Assistant prompts user: 'I have generated replan proposal version 2. Your Chemistry Lab extension has been accounted for, and Exam preparation is preserved intact. Operating Systems Assignment and DSA practice have shifted later. Would you like me to commit this revised schedule?'");

  // Step 7: Explicit User Approval and Safe Atomic Transaction
  console.log('\n[8] User confirms: "Yes, approve and commit."');
  console.log("    Invoking 'commit_plan' with exact plan ID and version 2...");

  const commitResult = await commitPlan({
    planId: preview.proposedPlanId,
    expectedVersion: 2,
    userId: DEMO_USER_ID,
  });

  console.log(`    Commit Result: ${commitResult.message}`);

  // Step 8: Verify Database Persistence
  const finalActivePlan = (await getPlan(DEMO_DATE, DEMO_USER_ID)).plan as any;
  console.log("\n[9] Verification of Committed Database State:");
  console.log(`    Current Active Plan ID: ${finalActivePlan.id} | Status: ${finalActivePlan.status} | Version: ${finalActivePlan.version}`);
  console.log("    Final Active Schedule:");
  for (const item of finalActivePlan.items) {
    const s = new Date(item.startTime).toISOString().slice(11, 16);
    const e = new Date(item.endTime).toISOString().slice(11, 16);
    console.log(`      • [${s} - ${e}] (${item.itemType}) ${item.title}`);
  }

  // Step 9: Audit History
  console.log("\n[10] Full Audit History (get_plan_history):");
  const history = await getPlanHistory(DEMO_DATE, DEMO_USER_ID);
  console.log(`    Total Versions Recorded: ${history.totalVersions} | Active Version: ${history.currentActiveVersion}`);
  for (const v of history.history) {
    console.log(`      - Version ${v.version} [${v.status}] (Items: ${v.itemCount}) Reason: ${v.replanReason || "Initial baseline"}`);
  }

  console.log("\n===============================================================================");
  console.log("                 Stage 4 Main Scenario Completed Successfully!                 ");
  console.log("===============================================================================");

  await prisma.$disconnect();
}

runStage4Demo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
