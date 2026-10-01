// 模拟服务器（台站端）：真实环境是后端接口，这里用 localStorage 模拟，
// 带网络延迟与弱网失败，用于演示断网续传、幂等重试。
import type { ComponentRecord, DraftBatch } from "../types";

const SERVER_KEY = "mcs-server-v1";
const WRITTEN_KEYS = "mcs-written-v1";

export interface ServerState {
  components: ComponentRecord[];
}

export function getServer(): ServerState {
  try {
    const raw = localStorage.getItem(SERVER_KEY);
    if (raw) return JSON.parse(raw) as ServerState;
  } catch {
    /* ignore */
  }
  return { components: [] };
}

export function setServer(state: ServerState): void {
  localStorage.setItem(SERVER_KEY, JSON.stringify(state));
}

function getWrittenKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(WRITTEN_KEYS);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function setWrittenKeys(keys: Set<string>): void {
  localStorage.setItem(WRITTEN_KEYS, JSON.stringify([...keys]));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PushResult {
  ok: boolean;
  /** 最后确认的序号 */
  confirmed: number;
  /** 本次新写入条数 */
  written: number;
  reason?: string;
}

/**
 * 按批次上传：从 batch.confirmedSeq 继续，已写入的测量按
 * 「批次标识 + 序号」幂等键去重，绝不重复写入。
 */
export async function pushBatch(
  batch: DraftBatch,
  items: ComponentRecord[],
  chaos: boolean,
  onProgress: (confirmed: number) => void,
): Promise<PushResult> {
  await delay(250 + Math.random() * 350);

  const written = getWrittenKeys();
  const server = getServer();
  let confirmed = batch.confirmedSeq;
  let newlyWritten = 0;

  // 弱网模式：每个批次在随机位置中断；正常模式：首个批次在接近末尾处断一次，演示续传
  const isFirstAttempt = batch.confirmedSeq === 0 && batch.status !== "partial";
  const failAt = chaos
    ? Math.floor(Math.random() * items.length)
    : isFirstAttempt
      ? Math.max(0, items.length - 2)
      : -1;

  for (let i = batch.confirmedSeq; i < items.length; i++) {
    if (failAt === i) {
      // 失败前的写入已落盘，重试时从 confirmed 继续，不重复
      setWrittenKeys(written);
      setServer(server);
      return {
        ok: false,
        confirmed,
        written: newlyWritten,
        reason: `网络中断，批次在第 ${i + 1} 条测量处失败`,
      };
    }

    const it = items[i];
    const key = `${batch.id}:${it.seq}`;
    if (!written.has(key)) {
      written.add(key);
      const idx = server.components.findIndex((c) => c.id === it.id);
      if (idx >= 0) server.components[idx] = it;
      else server.components.push(it);
      newlyWritten++;
    }
    confirmed = i + 1;
    onProgress(confirmed);
    // 每条测量之间的网络延迟
    await delay(90 + Math.random() * 160);
  }

  setWrittenKeys(written);
  setServer(server);
  return { ok: true, confirmed: items.length, written: newlyWritten };
}

export function resetServer(): void {
  localStorage.removeItem(SERVER_KEY);
  localStorage.removeItem(WRITTEN_KEYS);
}
