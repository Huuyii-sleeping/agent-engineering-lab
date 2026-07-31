import type { CodeNodeConfig } from "@orbit/workflow-core";
import * as process from "node:process";
import { runBash } from "../../tools/bash.js";
import type { WorkflowNodeExecutor } from "../executor-registry.js";

export type WorkflowCodeRunner = {
  run(input: { language: "javascript" | "python"; source: string; inputs: Record<string, unknown>; timeoutMs: number; signal: AbortSignal }): Promise<unknown>;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** 复用 Agent bash 沙箱；JavaScript 使用无 process/require 的 VM，Python 使用隔离模式和受限 builtins。 */
export class DefaultWorkflowCodeRunner implements WorkflowCodeRunner {
  async run(input: Parameters<WorkflowCodeRunner["run"]>[0]): Promise<unknown> {
    if (input.signal.aborted) throw new Error("Code 节点已取消。 ");
    const wrapper = input.language === "javascript" ? [
      "const vm=require('node:vm')",
      "const source=Buffer.from(process.argv[1],'base64').toString()",
      "const input=JSON.parse(Buffer.from(process.argv[2],'base64').toString())",
      "const context=vm.createContext({input:structuredClone(input),JSON,Math},{codeGeneration:{strings:false,wasm:false}})",
      `const result=new vm.Script('(function(input){"use strict"; '+source+'\\n})(input)').runInContext(context,{timeout:${Math.max(100, Math.trunc(input.timeoutMs))}})`,
      "process.stdout.write('__ORBIT_RESULT__'+JSON.stringify(result))",
    ].join(";") : [
      "import base64,json,sys",
      "source=base64.b64decode(sys.argv[1]).decode()",
      "inputs=json.loads(base64.b64decode(sys.argv[2]).decode())",
      "safe={'len':len,'min':min,'max':max,'sum':sum,'range':range,'str':str,'int':int,'float':float,'bool':bool,'list':list,'dict':dict}",
      "scope={'input':inputs,'result':None,'__builtins__':safe}",
      "exec(source,scope,scope)",
      "print('__ORBIT_RESULT__'+json.dumps(scope.get('result'),ensure_ascii=False))",
    ].join(";");
    const source = Buffer.from(input.source).toString("base64");
    const values = Buffer.from(JSON.stringify(input.inputs)).toString("base64");
    const command = input.language === "javascript"
      ? `${shellQuote(process.execPath)} --max-old-space-size=64 -e ${shellQuote(wrapper)} ${shellQuote(source)} ${shellQuote(values)}`
      : `python3 -I -c ${shellQuote(wrapper)} ${shellQuote(source)} ${shellQuote(values)}`;
    const output = await runBash(command, { signal: input.signal, timeoutMs: input.timeoutMs });
    const marker = output.lastIndexOf("__ORBIT_RESULT__");
    if (marker < 0) throw new Error(output);
    return JSON.parse(output.slice(marker + "__ORBIT_RESULT__".length)) as unknown;
  }
}

/** Code 节点执行器。 */
export class CodeWorkflowExecutor implements WorkflowNodeExecutor {
  readonly identity = { id: "workflow.code", version: 1 } as const;
  constructor(private readonly runner: WorkflowCodeRunner = new DefaultWorkflowCodeRunner()) {}

  async execute(context: Parameters<WorkflowNodeExecutor["execute"]>[0]) {
    const config = context.node.config as CodeNodeConfig;
    const inputs = await context.variables.resolveValue(config.inputs) as Record<string, unknown>;
    const result = await this.runner.run({ language: config.language, source: config.source, inputs, timeoutMs: context.node.execution.timeoutMs, signal: context.signal });
    return { outputs: { result } };
  }
}
