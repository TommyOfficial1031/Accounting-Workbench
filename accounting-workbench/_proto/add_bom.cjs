const fs = require("fs");
const p = "installer/windows/workbench.nsi";
const buf = fs.readFileSync(p);
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
if (buf.slice(0, 3).equals(BOM)) {
  console.log("already has BOM");
} else {
  fs.writeFileSync(p, Buffer.concat([BOM, buf]));
  console.log("BOM added, size", fs.statSync(p).size);
}
