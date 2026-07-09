// 把用户选的文件读成 base64 附件(供多模态发给 AI)。图片会先按需缩放,避免手机大图超限被丢弃。
const MAX_DIM = 1600;   // 图片最长边
const JPEG_Q = 0.85;

function readAsDataURL(f) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(f); });
}
function downscaleImage(f) {
  return new Promise((res) => {
    try {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        try {
          let { width: w, height: h } = img;
          const scale = Math.min(1, MAX_DIM / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          const dataUrl = c.toDataURL("image/jpeg", JPEG_Q);
          URL.revokeObjectURL(url);
          res({ name: (f.name || "image").replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", data: dataUrl.split(",")[1] });
        } catch { URL.revokeObjectURL(url); res(null); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    } catch { res(null); }
  });
}

export async function filesToAttachments(fileList) {
  const arr = [...(fileList || [])].slice(0, 4);
  const out = await Promise.all(arr.map(async (f) => {
    if ((f.type || "").startsWith("image/")) {
      const d = await downscaleImage(f);
      if (d) return d;
    }
    const dataUrl = await readAsDataURL(f);
    if (!dataUrl) return null;
    return { name: f.name, mime: f.type || "application/octet-stream", data: dataUrl.split(",")[1] };
  }));
  return out.filter(Boolean);
}
