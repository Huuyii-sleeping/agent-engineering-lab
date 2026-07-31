import { useCallback, useEffect, useState } from "react";
import { fetchSopDrafts, fetchSopVersions } from "../../../api";
import type { WorkflowReferenceCatalog, WorkflowVersionReferenceOption } from "../nodes/types";

/** 按需加载 Subworkflow 可引用的不可变发布版本。 */
export function useSopWorkflowReferences(active: boolean): WorkflowReferenceCatalog {
  const [state, setState] = useState<WorkflowReferenceCatalog["state"]>("idle");
  const [options, setOptions] = useState<WorkflowVersionReferenceOption[]>([]);
  const [message, setMessage] = useState("");
  const refresh = useCallback(() => {
    setState("loading");
    setMessage("");
    void fetchSopDrafts()
      .then(async (drafts) => (await Promise.all(drafts.map(async (draft) => ({ draft, versions: await fetchSopVersions(draft.id) })))).flatMap(({ draft, versions }) => versions.map((version) => ({
        workflowId: draft.id,
        workflowName: draft.name,
        versionId: version.id,
        version: version.version,
        contentHash: version.contentHash,
      }))))
      .then((next) => {
        setOptions(next.sort((left, right) => left.workflowName.localeCompare(right.workflowName, "zh-CN") || right.version - left.version));
        setState("ready");
      })
      .catch((error: unknown) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, []);
  useEffect(() => {
    if (active && state === "idle") refresh();
  }, [active, refresh, state]);
  return { state, options, message, refresh };
}
