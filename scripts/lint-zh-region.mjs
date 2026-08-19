// 繁体地区用词检查:防止 ZH_TW / ZH_HK 再退化成"机械转简体"或互相串味。
// 背景:lib/s2t.js 只是【逐字】换字形(单字表,无词表、无上下文),换不了地区【用词】
//(软件 台=軟體/港=軟件、网络 台=網路/港=網絡、用户 台=使用者/港=用戶…),
// 也修不了一简对多繁(复习→複習 而非 復習)。所以两本繁体词典必须【手写】,s2t 只作兜底。
// 本脚本只检查【译文】,不检查简体键名。
import fs from "fs";
const src = fs.readFileSync("lib/translations.js", "utf8");
const heads = [...src.matchAll(/const\s+(ZH_[A-Z]+)\s*=\s*\{/g)];
const seg = (name) => {
  const i = heads.findIndex((h) => h[1] === name);
  if (i < 0) return "";
  return src.slice(heads[i].index + heads[i][0].length, i + 1 < heads.length ? heads[i + 1].index : src.length);
};
const valuesOf = (name) => [...seg(name).matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]]);

// 台湾不该出现(大陆词 / 港式词 / 误转)
const BAD_TW = { "軟件":"軟體","網絡":"網路","視頻":"影片","音頻":"音訊","打印":"列印","默認":"預設","設置":"設定",
  "用戶":"使用者","屏幕":"螢幕","服務器":"伺服器","信息":"資訊","消息":"訊息","緩存":"快取","界面":"介面",
  "菜單":"選單","鼠標":"滑鼠","內存":"記憶體","激活":"啟用","登錄":"登入","文檔":"文件","數據":"資料",
  "復習":"複習","迴圈自動":"循環自動","頭發":"頭髮","皇後":"皇后","松開":"鬆開" };
// 港澳不该出现(大陆词 / 台式词 / 误转 / 台式字形)
const BAD_HK = { "軟體":"軟件","網路":"網絡","視頻":"影片","音頻":"音訊","默認":"預設","設置":"設定",
  "使用者":"用戶","專案":"項目","屏幕":"螢幕","服務器":"伺服器","信息":"資訊","消息":"訊息","緩存":"快取",
  "界面":"介面","菜單":"選單","鼠標":"滑鼠","內存":"記憶體","激活":"啟用","登錄":"登入","文檔":"文件",
  "復習":"複習","迴圈自動":"循環自動","頭發":"頭髮","皇後":"皇后","松開":"鬆開",
  "裡":"裏","說":"説","閱":"閲","啟":"啓","戶":"户","接著":"接着","順著":"順着","圍著":"圍着","放著":"放着" };

let bad = 0;
for (const [name, table] of [["ZH_TW", BAD_TW], ["ZH_HK", BAD_HK]]) {
  const rows = valuesOf(name);
  if (!rows.length) { console.error(`❌ 读不到 ${name}`); process.exit(1); }
  for (const [k, v] of rows) {
    for (const [wrong, right] of Object.entries(table)) {
      if (v.includes(wrong)) {
        console.error(`❌ ${name} 用词不当:「${wrong}」应作「${right}」\n   简体键: ${k.slice(0, 40)}\n   译文  : ${v.slice(0, 60)}`);
        bad++;
      }
    }
  }
}
if (bad) {
  console.error(`\n❌ 共 ${bad} 处。繁体两本词典要【手写】台/港各自的说法,别让 s2t 逐字转的结果留在词典里。`);
  process.exit(1);
}
console.log("✅ 繁体地区用词检查通过(ZH_TW / ZH_HK 无大陆词、无互相串味、无一简多繁误转)");
