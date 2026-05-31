import type OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { createDeterministicModel, type HarnessModelScriptItem } from "./model.js";

export type HarnessOpenAIRequestRecord = {
  model: string;
  messages: ChatCompletionMessageParam[];
  messageCount: number;
  toolsCount: number;
  metadata?: Record<string, unknown>;
};

export type DeterministicOpenAIClient = OpenAI & {
  readonly requests: HarnessOpenAIRequestRecord[];
  remaining(): number;
};

type HarnessCompletionParams = ChatCompletionCreateParamsNonStreaming & {
  metadata?: Record<string, unknown>;
};

function cloneMessage(message: ChatCompletionMessageParam): ChatCompletionMessageParam {
  return JSON.parse(JSON.stringify(message)) as ChatCompletionMessageParam;
}

export function createDeterministicOpenAIClient(
  script: HarnessModelScriptItem[],
): DeterministicOpenAIClient {
  const model = createDeterministicModel(script);
  const requests: HarnessOpenAIRequestRecord[] = [];
  const client = {
    requests,
    remaining: () => model.remaining(),
    chat: {
      completions: {
        create: async (params: HarnessCompletionParams): Promise<ChatCompletion> => {
          const metadata = params.metadata ? { ...params.metadata } : undefined;
          requests.push({
            model: params.model,
            messages: params.messages.map(cloneMessage),
            messageCount: params.messages.length,
            toolsCount: params.tools?.length ?? 0,
            metadata,
          });
          const response = await model.complete({
            prompt: params.messages.map((message) => message.role).join(","),
            metadata: {
              model: params.model,
              messageCount: params.messages.length,
              toolsCount: params.tools?.length ?? 0,
              ...(metadata ? { metadata } : {}),
            },
          });
          const hasToolCalls = response.toolCalls.length > 0;

          return {
            id: `chatcmpl_harness_${requests.length}`,
            object: "chat.completion",
            created: 0,
            model: params.model,
            choices: [
              {
                index: 0,
                finish_reason: hasToolCalls ? "tool_calls" : "stop",
                logprobs: null,
                message: {
                  role: "assistant",
                  content: response.content,
                  refusal: null,
                  tool_calls: hasToolCalls
                    ? response.toolCalls.map((toolCall) => ({
                        id: toolCall.id,
                        type: "function" as const,
                        function: {
                          name: toolCall.name,
                          arguments: toolCall.argumentsJson,
                        },
                      }))
                    : undefined,
                },
              },
            ],
            usage: {
              completion_tokens: response.content.length,
              prompt_tokens: 0,
              total_tokens: response.content.length,
            },
          } as ChatCompletion;
        },
      },
    },
  };

  return client as DeterministicOpenAIClient;
}
