import { useCallback, useEffect, useState } from "react";
import { fetchAgentVersions } from "../../../api";
import type { AgentVersionReferenceCatalog } from "../nodes/types";

/** 按需加载 Agent 节点可选择的不可变发布版本。 */
export function useSopAgentReferences(active: boolean): AgentVersionReferenceCatalog {
  const [state, setState] = useState<AgentVersionReferenceCatalog["state"]>("idle");
  const [options, setOptions] = useState<AgentVersionReferenceCatalog["options"]>([]);
  const [message, setMessage] = useState("");
  const refresh = useCallback(() => {
    setState("loading");
    setMessage("");
    void fetchAgentVersions()
      .then((versions) => {
        setOptions(versions.sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || right.version - left.version));
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
