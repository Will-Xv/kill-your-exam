// 【给存量资料补建检索索引】(2026-08)
// 背景:2026-08 之前上传的 PDF/图片【一个 chunk 都没有】(parse.js 对它们一律 text:"")。
// 新规矩是"上传时后台建索引 + 各处不再强制投喂整份原件"——如果不给老资料补上,
// 它们就会【既不被投喂、又检索不到】,等于凭空失联。所以要跑一次补建。
// 【自动补】不再需要人点按钮:应用启动后先扫一遍,之后每 6 小时再扫一次,把漏网的补上。
// 设计要点:
//  · 幂等:只处理【当前 chunks 数为 0】的资料,重复跑不会重复建、也不会重复花钱(补完后每次扫描就是一句 SQL);
//  · 顺带兜住【上传时建索引失败】的情况(网络抖动/AI 报错),下一轮扫描会自动重试;
//  · 归属:每份资料的 token 记到【它所属考试的主人】头上(谁的资料谁付账,同 runAsUser 的原则);
//  · 串行:一份一份来,不并发轰炸 API;失败的跳过、不影响后面。
import db from "@/lib/db";
import fs from "fs";
import { matPath } from "@/lib/files";
import { runAsUser } from "@/lib/reqctx";
import { indexPdfOutline, indexImageMaterial, indexBigPdf, HUGE_PDF_BYTES } from "@/lib/pdfIndex";
import { afterMaterialsChanged } from "@/lib/rag";

// 列出所有【没有索引】的 pdf/图片资料(含所属用户与语言)
export function listMissing() {
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT m.id, m.exam_id, m.filename, m.kind, m.mime, e.user_id, u.lang
      FROM materials m
      JOIN exams e ON e.id = m.exam_id
      LEFT JOIN users u ON u.id = e.user_id
      WHERE m.status='ready' AND m.stored=1 AND COALESCE(m.auto,0)=0
        AND m.kind IN ('pdf','image')
        AND NOT EXISTS (SELECT 1 FROM chunks c WHERE c.material_id = m.id)
      ORDER BY m.id`).all();
  } catch { return []; }
  return rows.map((r) => {
    let size = 0; try { size = fs.statSync(matPath(r.id)).size; } catch {}
    return { ...r, size };
  }).filter((r) => r.size > 0);
}

let running = false;
// 后台串行补建。返回立即;进度看日志([BACKFILL])。
export async function backfillMissing() {
  if (running) return { ok: false, reason: "already_running" };
  const rows = listMissing();
  if (!rows.length) return { ok: true, started: 0 };
  running = true;
  Promise.resolve().then(async () => {
    let done = 0, made = 0, failed = 0;
    for (const r of rows) {
      try {
        const n = await runAsUser(r.user_id, async () => {
          if (r.kind === "image") return await indexImageMaterial(r.id, r.exam_id, r.mime, r.lang);
          return r.size > HUGE_PDF_BYTES
            ? await indexBigPdf(r.id, r.exam_id, r.lang)
            : await indexPdfOutline(r.id, r.exam_id, r.lang);
        });
        made += n || 0;
        if (!n) failed++;
      } catch { failed++; }
      done++;
      if (done % 5 === 0) console.log(`[BACKFILL] ${done}/${rows.length} 份,已建 ${made} 段,失败 ${failed}`);
    }
    // 索引变了 → 重算资料覆盖度
    for (const eid of [...new Set(rows.map((r) => r.exam_id))]) { try { await afterMaterialsChanged(eid); } catch {} }
    console.log(`[BACKFILL] 完成:${done} 份,共建 ${made} 段,失败 ${failed}`);
    running = false;
  }).catch(() => { running = false; });
  return { ok: true, started: rows.length };
}
