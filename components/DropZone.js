"use client";
import { useState } from "react";

// 包裹上传区域:支持把文件拖进来、或在里面粘贴文件(截图)。
// onFiles 收到 File[] 数组。paste/drop 事件从内部的输入框冒泡到这里。
export default function DropZone({ onFiles, className = "", children }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${className} ${over ? "rounded-2xl ring-2 ring-amber-500" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const fs = [...(e.dataTransfer?.files || [])];
        if (fs.length) onFiles(fs);
      }}
      onPaste={(e) => {
        const fs = [...(e.clipboardData?.files || [])];
        if (fs.length) { e.preventDefault(); onFiles(fs); }
      }}
    >
      {children}
    </div>
  );
}
