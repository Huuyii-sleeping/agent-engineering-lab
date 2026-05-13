#!/usr/bin/env node
import * as process from "node:process";
import { dispatchCli } from "./entrypoints/cli-dispatcher.js";

dispatchCli().then((exitCode) => {
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
