import { describe, expect, it, vi } from "vitest";
import { AgentService } from "../../../src/service-api/index.js";
import { runServer } from "../../../src/service-api/server.js";

describe("entrypoints/server", () => {
  it("initializes the provided host before listening", async () => {
    const host = {
      initialize: vi.fn(async () => undefined),
      runtime: vi.fn(() => ({})),
    };
    const listen = vi.fn((port: number, bind: string, callback: () => void) => {
      callback();
      return undefined;
    });
    const output = {
      chunks: [] as string[],
      write(chunk: string) {
        this.chunks.push(String(chunk));
        return true;
      },
    };

    await runServer({
      host: host as {
        initialize(): Promise<void>;
        runtime(): unknown;
      },
      port: 4318,
      output: output as unknown as NodeJS.WritableStream,
      serverFactory: (service) => {
        expect(service).toBeInstanceOf(AgentService);
        return {
          once() {
            return this;
          },
          listen,
        } as {
          once(event: string, listener: (error: Error) => void): unknown;
          listen(port: number, host: string, callback: () => void): void;
        };
      },
    });

    expect(host.initialize).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(4318, "0.0.0.0", expect.any(Function));
    expect(output.chunks.join("")).toContain("http://0.0.0.0:4318");
  });
});
