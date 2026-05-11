#!/usr/bin/env node

let buffer = Buffer.alloc(0);

function send(message) {
  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
  process.stdout.write(`${header}${body}`);
}

function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }
  const { id, method, params } = message;
  if (typeof method !== "string") {
    return;
  }
  if (method === "notifications/initialized") {
    return;
  }
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "demo-fixture", version: "0.1.0" },
        capabilities: { tools: {} },
      },
    });
    return;
  }
  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "echo_upper",
            description: "Uppercase an input string.",
            inputSchema: {
              type: "object",
              properties: {
                text: { type: "string" },
              },
              required: ["text"],
            },
          },
          {
            name: "fail_now",
            description: "Return a structured failure from the fixture server.",
            inputSchema: {
              type: "object",
              properties: {
                reason: { type: "string" },
              },
            },
          },
        ],
      },
    });
    return;
  }
  if (method === "tools/call") {
    const toolName = String(params?.name ?? "");
    const args = params?.arguments && typeof params.arguments === "object" ? params.arguments : {};
    if (toolName === "echo_upper") {
      const text = String(args.text ?? "");
      send({
        jsonrpc: "2.0",
        id,
        result: {
          structuredContent: {
            ok: true,
            echoed: text.toUpperCase(),
            source: "mcp-demo-server",
          },
          content: [{ type: "text", text: text.toUpperCase() }],
        },
      });
      return;
    }
    if (toolName === "fail_now") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: String(args.reason ?? "fixture failure") }],
        },
      });
      return;
    }
    send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `unknown tool: ${toolName}`,
      },
    });
    return;
  }
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `unknown method: ${method}`,
    },
  });
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      process.exit(1);
    }
    const bodyLength = Number(match[1]);
    const frameEnd = headerEnd + 4 + bodyLength;
    if (buffer.length < frameEnd) {
      return;
    }
    const body = buffer.slice(headerEnd + 4, frameEnd).toString("utf8");
    buffer = buffer.slice(frameEnd);
    try {
      handleMessage(JSON.parse(body));
    } catch {
      process.exit(1);
    }
  }
});
