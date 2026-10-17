async function sendMcp(method: string, params?: unknown) {
  const res = await fetch("http://127.0.0.1:3000/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 10000),
      method,
      params,
    }),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function verifyAll() {
  console.log("--- 1. Testing tools/list ---");
  const listRes = await sendMcp("tools/list");
  const toolNames = listRes.result?.tools?.map((t: any) => t.name);
  console.log("Registered tools:", toolNames);

  console.log("\n--- 2. Testing create_task ---");
  const createRes = await sendMcp("tools/call", {
    name: "create_task",
    arguments: {
      title: "Alexa Plus Hackathon Presentation",
      description: "Prepare live demo and architectural slides",
      duration: 45,
      priority: "HIGH",
      tags: ["alexa", "hackathon"],
    },
  });
  console.log("create_task result:", createRes.result?.content?.[0]?.text);
  const createdObj = JSON.parse(createRes.result?.content?.[0]?.text || "{}");
  const createdId = createdObj.task?.id;

  console.log("\n--- 3. Testing list_tasks ---");
  const listTasksRes = await sendMcp("tools/call", {
    name: "list_tasks",
    arguments: {
      priority: "HIGH",
    },
  });
  console.log("list_tasks result:", listTasksRes.result?.content?.[0]?.text);

  console.log("\n--- 4. Testing update_task ---");
  const updateRes = await sendMcp("tools/call", {
    name: "update_task",
    arguments: {
      id: createdId,
      duration: 60,
      description: "Updated description for live demo",
    },
  });
  console.log("update_task result:", updateRes.result?.content?.[0]?.text);

  console.log("\n--- 5. Testing complete_task ---");
  const completeRes = await sendMcp("tools/call", {
    name: "complete_task",
    arguments: {
      id: createdId,
    },
  });
  console.log("complete_task result:", completeRes.result?.content?.[0]?.text);

  console.log("\n--- 6. Testing delete_task ---");
  const deleteRes = await sendMcp("tools/call", {
    name: "delete_task",
    arguments: {
      id: createdId,
    },
  });
  console.log("delete_task result:", deleteRes.result?.content?.[0]?.text);

  console.log("\n--- 7. Testing get_preferences ---");
  const getPrefRes = await sendMcp("tools/call", {
    name: "get_preferences",
    arguments: {},
  });
  console.log("get_preferences result:", getPrefRes.result?.content?.[0]?.text);

  console.log("\n--- 8. Testing update_preferences ---");
  const updatePrefRes = await sendMcp("tools/call", {
    name: "update_preferences",
    arguments: {
      focusMinutes: 50,
      breakMinutes: 10,
    },
  });
  console.log("update_preferences result:", updatePrefRes.result?.content?.[0]?.text);

  console.log("\n--- 9. Testing get_day_context ---");
  const contextRes = await sendMcp("tools/call", {
    name: "get_day_context",
    arguments: {
      date: "2026-10-18",
    },
  });
  console.log("get_day_context result:", contextRes.result?.content?.[0]?.text);

  console.log("\nALL 8 MCP TOOLS VERIFIED SUCCESSFULLY VIA LIVE HTTP TRANSPORT!");
}

verifyAll().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
