/** 增量 SSE 解码器，保留半包并只返回完整 data frame。 */
export class WorkflowSseDecoder {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const frames: string[] = [];
    while (true) {
      const boundary = this.buffer.indexOf("\n\n");
      if (boundary < 0) break;
      frames.push(this.buffer.slice(0, boundary + 2));
      this.buffer = this.buffer.slice(boundary + 2);
    }
    return frames;
  }

  static event(frame: string): unknown {
    const data = frame.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    return data ? JSON.parse(data) as unknown : undefined;
  }
}
