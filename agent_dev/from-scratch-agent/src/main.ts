#!/usr/bin/env node
import * as process from "node:process";
import { runCli } from "./cli.js";

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
