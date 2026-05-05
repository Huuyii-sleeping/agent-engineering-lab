import { runToolByName } from "../dist/tools/index.js";

const j = (s) => {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
};

const out = [];
out.push(["add_a", await runToolByName("team_add_teammate", JSON.stringify({ name: "alice" }))]);
out.push(["add_b", await runToolByName("team_add_teammate", JSON.stringify({ name: "bob" }))]);
out.push(["status_a", await runToolByName("team_set_status", JSON.stringify({ teammate_id: 1, status: "working" }))]);
out.push(["msg_a", await runToolByName("team_message", JSON.stringify({ teammate_id: 1, content: "hello alice" }))]);
out.push(["broadcast", await runToolByName("team_broadcast", JSON.stringify({ content: "sync all" }))]);

const shutdownReqRaw = await runToolByName(
  "team_shutdown_request",
  JSON.stringify({ teammate_id: 2, payload: "shutdown for maintenance" }),
);
out.push(["shutdown_req", shutdownReqRaw]);
const shutdownReqId = JSON.parse(shutdownReqRaw).request?.request_id;

if (shutdownReqId) {
  out.push([
    "shutdown_res",
    await runToolByName(
      "team_shutdown_response",
      JSON.stringify({ request_id: shutdownReqId, approve: true, note: "approved" }),
    ),
  ]);
}

const planReqRaw = await runToolByName(
  "team_plan_approval_request",
  JSON.stringify({ teammate_id: 1, payload: "approve release plan v1" }),
);
out.push(["plan_req", planReqRaw]);
const planReqId = JSON.parse(planReqRaw).request?.request_id;

if (planReqId) {
  out.push([
    "plan_res",
    await runToolByName(
      "team_plan_approval_response",
      JSON.stringify({ request_id: planReqId, approve: false, note: "need more tests" }),
    ),
  ]);
}

out.push(["list_team", await runToolByName("team_list_teammates", "{}")]);
out.push(["inbox_a", await runToolByName("team_read_inbox", JSON.stringify({ teammate_id: 1 }))]);
out.push(["inbox_b", await runToolByName("team_read_inbox", JSON.stringify({ teammate_id: 2 }))]);
out.push(["list_requests", await runToolByName("team_list_requests", "{}")]);

for (const [name, raw] of out) {
  console.log(`=== ${name} ===`);
  console.log(j(raw));
}
