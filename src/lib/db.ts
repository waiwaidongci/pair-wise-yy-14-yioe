// 本地持久化（localStorage）—— 断网期间所有草稿都写在这里
const STATE_KEY = "mcs-state-v1";

export function loadState<T>(): T | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveState<T>(state: T): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // 存储失败时静默降级，不影响现场录入
  }
}

export function clearState(): void {
  localStorage.removeItem(STATE_KEY);
}
