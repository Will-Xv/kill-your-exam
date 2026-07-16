// 请求级上下文:把当前请求的 userId 带进任意深层函数(如 devtime 的日期偏移),避免全局串味。
import { AsyncLocalStorage } from "node:async_hooks";
export const reqStore = new AsyncLocalStorage();
export function setReqUser(userId) { try { reqStore.enterWith({ userId }); } catch {} }
export function currentUserId() { try { return reqStore.getStore()?.userId; } catch { return undefined; } }
