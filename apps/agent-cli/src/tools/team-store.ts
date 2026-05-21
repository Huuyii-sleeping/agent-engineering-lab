import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { nowTimestampMs, parseTimestampMs } from "../time.js";
import type { TeamMessage, TeamRequest, Teammate } from "./team-types.js";
import { TEAM_SCHEMA_VERSION } from "./team-types.js";

type InboxState = Record<string, { lastReadAt: number }>;

export class TeamStore {
  private readonly inboxDir: string;
  private readonly teammatesPath: string;
  private readonly requestsPath: string;
  private readonly inboxStatePath: string;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly root = path.join(process.cwd(), ".team")) {
    this.inboxDir = path.join(this.root, "inbox");
    this.teammatesPath = path.join(this.root, "teammates.json");
    this.requestsPath = path.join(this.root, "requests.json");
    this.inboxStatePath = path.join(this.root, "inbox-state.json");
  }

  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await mkdir(this.inboxDir, { recursive: true });
        await this.ensureJsonFile(this.teammatesPath, "[]\n");
        await this.ensureJsonFile(this.requestsPath, "[]\n");
        await this.ensureJsonFile(this.inboxStatePath, "{}\n");
      })();
    }
    await this.initPromise;
  }

  private async ensureJsonFile(filePath: string, defaultContent: string): Promise<void> {
    try {
      await readFile(filePath, "utf8");
    } catch {
      await writeFile(filePath, defaultContent, "utf8");
    }
  }

  async loadTeammates(): Promise<Teammate[]> {
    await this.ensureInit();
    const raw = await readFile(this.teammatesPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<Teammate>>;
    return parsed.map((item) => ({
      schemaVersion: Number.isInteger(Number(item.schemaVersion)) ? Number(item.schemaVersion) : 1,
      id: Number(item.id),
      name: String(item.name ?? ""),
      status:
        item.status === "working" || item.status === "idle" || item.status === "shutdown"
          ? item.status
          : "idle",
      updatedAt: parseTimestampMs(item.updatedAt, nowTimestampMs()),
    }));
  }

  async saveTeammates(teammates: Teammate[]): Promise<void> {
    await writeFile(this.teammatesPath, `${JSON.stringify(teammates, null, 2)}\n`, "utf8");
  }

  async loadRequests(): Promise<TeamRequest[]> {
    await this.ensureInit();
    const raw = await readFile(this.requestsPath, "utf8");
    const parsed = JSON.parse(raw) as Array<Partial<TeamRequest>>;
    return parsed.map((item) => ({
      schemaVersion: Number.isInteger(Number(item.schemaVersion)) ? Number(item.schemaVersion) : 1,
      request_id: String(item.request_id ?? ""),
      type:
        item.type === "shutdown_request" || item.type === "plan_approval"
          ? item.type
          : "plan_approval",
      from: String(item.from ?? "main"),
      to: String(item.to ?? ""),
      status:
        item.status === "pending" || item.status === "approved" || item.status === "rejected"
          ? item.status
          : "pending",
      payload: String(item.payload ?? ""),
      updatedAt: parseTimestampMs(item.updatedAt, nowTimestampMs()),
    }));
  }

  async saveRequests(requests: TeamRequest[]): Promise<void> {
    await writeFile(this.requestsPath, `${JSON.stringify(requests, null, 2)}\n`, "utf8");
  }

  inboxPath(teammateId: number): string {
    return path.join(this.inboxDir, `${teammateId}.jsonl`);
  }

  async appendInboxMessage(teammateId: number, message: TeamMessage): Promise<void> {
    await appendFile(this.inboxPath(teammateId), `${JSON.stringify(message)}\n`, "utf8");
  }

  private async loadInboxState(): Promise<InboxState> {
    await this.ensureInit();
    const raw = await readFile(this.inboxStatePath, "utf8");
    const parsed = JSON.parse(raw || "{}") as Record<string, Partial<{ lastReadAt: unknown }>>;
    const state: InboxState = {};
    for (const [key, value] of Object.entries(parsed)) {
      const lastReadAt = Number(value?.lastReadAt);
      state[key] = { lastReadAt: Number.isFinite(lastReadAt) && lastReadAt >= 0 ? lastReadAt : 0 };
    }
    return state;
  }

  private async saveInboxState(state: InboxState): Promise<void> {
    await writeFile(this.inboxStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async readInbox(teammateId: number): Promise<{ messages: TeamMessage[]; unreadCount: number; lastReadAt: number }> {
    const inbox = this.inboxPath(teammateId);
    const raw = await readFile(inbox, "utf8").catch(() => "");
    const messages = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TeamMessage);
    const state = await this.loadInboxState();
    const lastReadAt = state[String(teammateId)]?.lastReadAt ?? 0;
    return {
      messages,
      unreadCount: messages.filter((message) => Number(message.createdAt) > lastReadAt).length,
      lastReadAt,
    };
  }

  async markInboxRead(teammateId: number): Promise<{ lastReadAt: number }> {
    const inbox = await this.readInbox(teammateId);
    const latestMessageAt = inbox.messages.reduce(
      (latest, message) => Math.max(latest, Number(message.createdAt) || 0),
      0,
    );
    const lastReadAt = Math.max(nowTimestampMs(), latestMessageAt);
    const state = await this.loadInboxState();
    state[String(teammateId)] = { lastReadAt };
    await this.saveInboxState(state);
    return { lastReadAt };
  }

  createTeammate(id: number, name: string): Teammate {
    return {
      schemaVersion: TEAM_SCHEMA_VERSION,
      id,
      name,
      status: "idle",
      updatedAt: nowTimestampMs(),
    };
  }
}
