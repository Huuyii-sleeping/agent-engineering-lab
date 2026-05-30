export type HarnessToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type HarnessModelRequest = {
  prompt: string;
  metadata?: Record<string, unknown>;
};

export type HarnessModelResponse = {
  content: string;
  toolCalls: HarnessToolCall[];
};

export type HarnessModelScriptItem =
  | {
      type: "message";
      content: string;
    }
  | {
      type: "tool_calls";
      content?: string;
      toolCalls: HarnessToolCall[];
    }
  | {
      type: "error";
      message: string;
    };

export type DeterministicModel = {
  readonly requests: HarnessModelRequest[];
  complete(request: HarnessModelRequest): Promise<HarnessModelResponse>;
  remaining(): number;
};

export function createDeterministicModel(script: HarnessModelScriptItem[]): DeterministicModel {
  const queue = [...script];
  const requests: HarnessModelRequest[] = [];
  return {
    requests,
    async complete(request) {
      requests.push({ ...request, metadata: request.metadata ? { ...request.metadata } : undefined });
      const next = queue.shift();
      if (!next) {
        throw new Error("deterministic model script exhausted");
      }
      if (next.type === "error") {
        throw new Error(next.message);
      }
      if (next.type === "tool_calls") {
        return {
          content: next.content ?? "",
          toolCalls: next.toolCalls.map((toolCall) => ({ ...toolCall })),
        };
      }
      return {
        content: next.content,
        toolCalls: [],
      };
    },
    remaining() {
      return queue.length;
    },
  };
}
