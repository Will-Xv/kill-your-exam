"use client";
import { createContext, useContext, useState, useCallback } from "react";

const Ctx = createContext(null);

const TYPE_LABEL = {
  no_key: "未配置密钥", bad_key: "密钥无效", quota: "额度用完",
  rate_limit: "服务繁忙", server: "服务商故障", network: "网络问题",
  bad_response: "返回异常", unknown: "未知错误"
};

export function AiErrorProvider({ children }) {
  const [err, setErr] = useState(null);
  const show = useCallback((e) => setErr(e), []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {err && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setErr(null)}>
          <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-2">🔌</div>
            <h2 className="text-lg font-bold mb-2">AI 服务出了点问题</h2>
            <p className="text-stone-700 mb-1">{err.friendly}</p>
            <p className="text-sm text-stone-500 mb-4">
              这是 AI 服务(API)层面的问题,<b>不是你操作错了</b>,也不是网站坏了。
              {err.type === "rate_limit" || err.type === "server" ? "通常几分钟后自动恢复,可以稍后再试。" : "请联系 Will 处理。"}
            </p>
            <div className="flex gap-2">
              <a className="btn flex-1" href={`mailto:xuy413682@gmail.com?subject=${encodeURIComponent("备考网站 AI 服务故障:" + (TYPE_LABEL[err.type] || err.type))}&body=${encodeURIComponent("错误类型: " + err.type + "\n提示: " + err.friendly + "\n详情: " + (err.detail || "") + "\n时间: " + new Date().toLocaleString())}`}>
                📧 联系 Will
              </a>
              <button className="btn-ghost" onClick={() => setErr(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useAiFetch() {
  const ctx = useContext(Ctx);
  // 统一 fetch:自动弹出 AI 错误弹窗;其他错误抛出
  return useCallback(async (url, options) => {
    let res;
    try {
      res = await fetch(url, options);
    } catch {
      ctx.show({ type: "network", friendly: "无法连接到网站服务器,请检查网络。", detail: "" });
      throw new Error("network");
    }
    if (res.status === 502) {
      const data = await res.json().catch(() => null);
      if (data?.aiError) {
        ctx.show(data);
        throw new Error("ai-error");
      }
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `HTTP ${res.status}`);
    }
    return res.json();
  }, [ctx]);
}
