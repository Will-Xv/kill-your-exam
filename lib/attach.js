// 把用户选的文件读成 base64 附件(供多模态发给 AI)
export async function filesToAttachments(fileList) {
  const arr = [...(fileList || [])].slice(0, 4);
  return Promise.all(arr.map((f) => new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, mime: f.type || "application/octet-stream", data: String(r.result).split(",")[1] });
    r.onerror = () => res(null);
    r.readAsDataURL(f);
  }))).then((a) => a.filter(Boolean));
}
