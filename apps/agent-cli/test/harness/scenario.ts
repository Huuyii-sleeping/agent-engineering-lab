import { createDeterministicModel, type DeterministicModel, type HarnessModelRequest, type HarnessModelScriptItem } from "./model.js";
import { type HarnessWorkspace, type HarnessWorkspaceOptions, withHarnessWorkspace } from "./workspace.js";

export type HarnessScenarioContext = {
  workspace: HarnessWorkspace;
  model: DeterministicModel;
  output: string[];
  emit(message: string): void;
};

export type HarnessScenarioStep =
  | {
      name: string;
      run: (context: HarnessScenarioContext) => Promise<void> | void;
    }
  | {
      name: string;
      writeFile: { path: string; content: string };
    }
  | {
      name: string;
      expectFile: { path: string; contains?: string; equals?: string; exists?: boolean };
    }
  | {
      name: string;
      callModel: { prompt: string; expectContent?: string; expectToolCallName?: string };
    }
  | {
      name: string;
      emit: string;
    }
  | {
      name: string;
      expectOutputContains: string;
    };

export type HarnessScenario = {
  name: string;
  workspace?: HarnessWorkspaceOptions;
  model?: HarnessModelScriptItem[];
  steps: HarnessScenarioStep[];
};

export type HarnessScenarioStepResult = {
  name: string;
  status: "passed" | "failed";
  message?: string;
};

export type HarnessScenarioResult = {
  name: string;
  status: "passed" | "failed";
  failedStep: string | null;
  steps: HarnessScenarioStepResult[];
  output: string[];
  modelRequests: HarnessModelRequest[];
};

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function runStep(step: HarnessScenarioStep, context: HarnessScenarioContext): Promise<void> {
  if ("run" in step) {
    await step.run(context);
    return;
  }
  if ("writeFile" in step) {
    await context.workspace.writeText(step.writeFile.path, step.writeFile.content);
    return;
  }
  if ("expectFile" in step) {
    const expectation = step.expectFile;
    const exists = await context.workspace.exists(expectation.path);
    if (expectation.exists !== undefined) {
      assertCondition(exists === expectation.exists, `${expectation.path} existence expected ${expectation.exists}`);
    }
    if (!exists) {
      throw new Error(`${expectation.path} does not exist`);
    }
    const content = await context.workspace.readText(expectation.path);
    if (expectation.equals !== undefined) {
      assertCondition(content === expectation.equals, `${expectation.path} did not equal expected content`);
    }
    if (expectation.contains !== undefined) {
      assertCondition(content.includes(expectation.contains), `${expectation.path} did not contain ${expectation.contains}`);
    }
    return;
  }
  if ("callModel" in step) {
    const response = await context.model.complete({ prompt: step.callModel.prompt });
    if (step.callModel.expectContent !== undefined) {
      assertCondition(response.content === step.callModel.expectContent, `model content did not equal ${step.callModel.expectContent}`);
    }
    if (step.callModel.expectToolCallName !== undefined) {
      assertCondition(
        response.toolCalls.some((toolCall) => toolCall.name === step.callModel.expectToolCallName),
        `model tool calls did not include ${step.callModel.expectToolCallName}`,
      );
    }
    return;
  }
  if ("emit" in step) {
    context.emit(step.emit);
    return;
  }
  if ("expectOutputContains" in step) {
    assertCondition(
      context.output.some((line) => line.includes(step.expectOutputContains)),
      `output did not contain ${step.expectOutputContains}`,
    );
  }
}

export async function runHarnessScenario(scenario: HarnessScenario): Promise<HarnessScenarioResult> {
  const output: string[] = [];
  const model = createDeterministicModel(scenario.model ?? []);
  const steps: HarnessScenarioStepResult[] = [];
  let failedStep: string | null = null;

  await withHarnessWorkspace(scenario.workspace ?? {}, async (workspace) => {
    const context: HarnessScenarioContext = {
      workspace,
      model,
      output,
      emit(message) {
        output.push(message);
      },
    };
    for (const step of scenario.steps) {
      try {
        await runStep(step, context);
        steps.push({ name: step.name, status: "passed" });
      } catch (error) {
        failedStep = step.name;
        steps.push({
          name: step.name,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
        break;
      }
    }
  });

  return {
    name: scenario.name,
    status: failedStep ? "failed" : "passed",
    failedStep,
    steps,
    output,
    modelRequests: model.requests,
  };
}
