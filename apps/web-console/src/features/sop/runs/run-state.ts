import {
  applyWorkflowRuntimeEventToSnapshot,
  type WorkflowRunSnapshot,
  type WorkflowRuntimeEvent,
} from "@orbit/workflow-core";

/** 将单个 SSE 事实合并进 Web 运行快照。 */
export function applyWorkflowRuntimeEvent(run: WorkflowRunSnapshot, event: WorkflowRuntimeEvent): WorkflowRunSnapshot {
  return applyWorkflowRuntimeEventToSnapshot(run, event);
}

/** 按 nodeId、iterationIndex、instanceId 返回去重后的稳定容器实例列表。 */
export function selectWorkflowNodeInstances(run: WorkflowRunSnapshot) {
  return Object.values(run.nodeInstances ?? {}).sort((left, right) => (
    left.nodeId.localeCompare(right.nodeId)
      || (left.iterationIndex ?? Number.MAX_SAFE_INTEGER) - (right.iterationIndex ?? Number.MAX_SAFE_INTEGER)
      || left.instanceId.localeCompare(right.instanceId)
  ));
}

/** 按事件 id 去重并保持升序，避免 SSE 重连造成 UI 重复日志。 */
export function appendWorkflowRuntimeEvent(events: WorkflowRuntimeEvent[], event: WorkflowRuntimeEvent): WorkflowRuntimeEvent[] {
  if (events.some((item) => item.id === event.id)) return events;
  return [...events, event].sort((left, right) => left.id - right.id);
}
