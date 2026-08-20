// 请求级上下文:把当前请求的 userId 带进任意深层函数(如 devtime 的日期偏移),避免全局串味。
import { AsyncLocalStorage } from "node:async_hooks";
export const reqStore = new AsyncLocalStorage();
export function setReqUser(userId) { try { reqStore.enterWith({ userId }); } catch {} }
// 【后台任务也要认领用户】fire-and-forget 的 Promise 有时会脱离原请求的 AsyncLocalStorage 上下文,
// 导致 token 用量记不到人头上。凡是【由某个用户的操作触发】的后台活(上传入库、模考判题…),
// 一律用它把 userId 显式带进去——谁用的算谁的,不许赖到"系统"账上。
export function runAsUser(userId, fn) {
  const uid = Number(userId) || 0;
  if (!uid) return fn();
  return reqStore.run({ userId: uid }, fn);
}
export function currentUserId() { try { return reqStore.getStore()?.userId; } catch { return undefined; } }
