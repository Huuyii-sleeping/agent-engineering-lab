import dotenv from "dotenv";
import OpenAI from "openai";
import * as process from "node:process";

dotenv.config({ override: true });

const modelEnv = process.env.MODEL_ID;
if (!modelEnv) {
  throw new Error("缺少环境变量: MODEL_ID");
}

export const MODEL = modelEnv;
export const SYSTEM = `你是位于 ${process.cwd()} 的编程代理。优先使用工具完成任务。多步骤任务请调用 todo 工具进行规划与进度更新。`;

export function createClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}
