const fs = require("fs");
const p = "installer/windows/workbench.nsi";
const raw = fs.readFileSync(p, "utf8");
const BOM = raw.charCodeAt(0) === 0xfeff;
let t = (BOM ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
const before = t;

/* 写入前先清理旧文件：
   ① 普通删除；② 删不掉就清只读/隐藏属性再删；③ 还删不掉就改名成 .old-<时间>；
   这样即使旧 exe 是只读、或被杀软短暂占用，也不会立刻弹「无法打开要写入的文件」。 */
const anchor = [
  '  SetOutPath "$INSTDIR"',
  "",
  "  ; 主程序",
  '  File "${ROOT}\\src-tauri\\target\\release\\${APP_EXE}"',
].join("\n");
if (!t.includes(anchor)) throw new Error("主程序写入锚点没找到");

const next = [
  '  SetOutPath "$INSTDIR"',
  "",
  "  ; 清理旧的主程序（只读/被杀软短暂占用时先清属性、改名，避免安装卡在覆盖失败）",
  '  ${If} ${FileExists} "$INSTDIR\\${APP_EXE}"',
  '    Delete "$INSTDIR\\${APP_EXE}"',
  '    ${If} ${FileExists} "$INSTDIR\\${APP_EXE}"',
  '      nsExec::ExecToLog \'attrib -R -S -H "$INSTDIR\\${APP_EXE}"\'',
  '      Delete "$INSTDIR\\${APP_EXE}"',
  "    ${EndIf}",
  '    ${If} ${FileExists} "$INSTDIR\\${APP_EXE}"',
  '      DetailPrint "旧的主程序被占用，尝试改名后继续安装…"',
  '      Rename "$INSTDIR\\${APP_EXE}" "$INSTDIR\\${APP_EXE}.old"',
  "      Delete /REBOOTOK \"$INSTDIR\\${APP_EXE}.old\"",
  "    ${EndIf}",
  "  ${EndIf}",
  "",
  "  ; 主程序",
  '  File "${ROOT}\\src-tauri\\target\\release\\${APP_EXE}"',
].join("\n");

t = t.replace(anchor, next);

if (t === before) throw new Error("没有改动");
fs.writeFileSync(p, (BOM ? "\ufeff" : "") + t.replace(/\n/g, "\r\n"), "utf8");
console.log("nsi: pre-clean of old exe added");
