import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const rootPath = root.pathname;
const appNames = ["web-console", "bff", "agent-cli"];
const contractNames = ["WorkflowDraft", "WorkflowVersion", "WorkflowNode", "WorkflowEdge", "NodePort", "VariableRef", "CredentialRef"];

async function filesUnder(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(path);
  }
  return files;
}

const errors = [];
const coreFiles = await filesUnder(join(rootPath, "packages/workflow-core/src"), [".ts"]);
for (const file of coreFiles) {
  const source = await readFile(file, "utf8");
  if (/from\s+["'](?:react|@xyflow\/react|@nestjs\/|\.\.\/\.\.\/\.\.\/apps\/)/.test(source)) {
    errors.push(`${relative(rootPath, file)} 违反 workflow-core 纯 TypeScript 依赖方向。`);
  }
}

for (const appName of appNames) {
  const packagePath = join(rootPath, `apps/${appName}/package.json`);
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageJson.dependencies?.["@orbit/workflow-core"] !== "workspace:*") errors.push(`${relative(rootPath, packagePath)} 必须声明 @orbit/workflow-core workspace 依赖。`);
  const sourceFiles = await filesUnder(join(rootPath, `apps/${appName}/src`), [".ts", ".tsx"]);
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    for (const contractName of contractNames) {
      if (new RegExp(`export\\s+(?:type|interface)\\s+${contractName}\\b`).test(source)) errors.push(`${relative(rootPath, file)} 重复声明共享契约 ${contractName}。`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`workflow-core boundary check passed (${coreFiles.length} core files, ${appNames.length} consumers).`);
}
