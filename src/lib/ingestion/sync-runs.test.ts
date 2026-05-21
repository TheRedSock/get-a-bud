import { NonRetriableError } from "inngest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import {
  findActiveSyncRun,
  findActiveSyncRunsByConnectionIds,
  prepareSyncRun,
  resolveSyncRunForEnqueue,
} from "@/lib/ingestion/sync-runs";

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe("resolveSyncRunForEnqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an active sync run when runId is omitted", async () => {
    const activeRun = {
      id: "run-active",
      connectionId: "conn-1",
      status: "running",
    };
    mockSelect.mockReturnValue(selectChain([activeRun]));

    const run = await resolveSyncRunForEnqueue({ connectionId: "conn-1" });

    expect(run.id).toBe("run-active");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates a queued run when no active run exists", async () => {
    mockSelect.mockReturnValue(selectChain([]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: "run-new", connectionId: "conn-1", status: "queued" },
        ]),
      }),
    });

    const run = await resolveSyncRunForEnqueue({ connectionId: "conn-1" });

    expect(run.id).toBe("run-new");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("throws when an explicit runId does not belong to the connection", async () => {
    mockSelect.mockReturnValue(
      selectChain([{ id: "run-1", connectionId: "other-conn" }]),
    );

    await expect(
      resolveSyncRunForEnqueue({
        connectionId: "conn-1",
        runId: "run-1",
      }),
    ).rejects.toThrow(NonRetriableError);
  });
});

describe("findActiveSyncRun", () => {
  it("returns the most recent active run", async () => {
    mockSelect.mockReturnValue(
      selectChain([{ id: "run-1", connectionId: "conn-1", status: "queued" }]),
    );

    const run = await findActiveSyncRun("conn-1");

    expect(run?.id).toBe("run-1");
  });
});

describe("findActiveSyncRunsByConnectionIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one active run per connection", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        { id: "run-b", connectionId: "conn-b", status: "running" },
        { id: "run-a", connectionId: "conn-a", status: "queued" },
      ]),
    });

    const map = await findActiveSyncRunsByConnectionIds(["conn-a", "conn-b"]);

    expect(map.get("conn-a")?.id).toBe("run-a");
    expect(map.get("conn-b")?.id).toBe("run-b");
  });
});

describe("prepareSyncRun", () => {
  beforeEach(() => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: "run-1", connectionId: "conn-1", status: "running" },
          ]),
        }),
      }),
    });
  });

  it("marks the resolved run as running", async () => {
    mockSelect.mockReturnValue(
      selectChain([{ id: "run-1", connectionId: "conn-1", status: "queued" }]),
    );

    const run = await prepareSyncRun({ connectionId: "conn-1" });

    expect(run.status).toBe("running");
    expect(mockUpdate).toHaveBeenCalled();
  });
});
