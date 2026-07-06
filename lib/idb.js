// 极简 IndexedDB 键值存储:用于存较大的数据(如未压缩的手写/上传附件),localStorage 装不下。
const DB = "kye", STORE = "kv";
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function idbSet(k, v) {
  try { const db = await open(); await new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch {}
}
export async function idbGet(k) {
  try { const db = await open(); return await new Promise((res, rej) => { const tx = db.transaction(STORE, "readonly"); const rq = tx.objectStore(STORE).get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); } catch { return undefined; }
}
export async function idbDel(k) {
  try { const db = await open(); await new Promise((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch {}
}
