#!/usr/bin/env node
/* web/index.html 의 ?v=N 캐시버스터를 일괄 +1. 수동 sed 대체.
   사용: npm run bump  (배포 전 1회) */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "web", "index.html");
let src = fs.readFileSync(file, "utf8");
const vers = [...src.matchAll(/[?&]v=(\d+)/g)].map(m => +m[1]);
if (!vers.length) { console.error("no ?v=N found in web/index.html"); process.exit(1); }
const cur = Math.max(...vers);
const next = cur + 1;
const n = (src.match(/[?&]v=\d+/g) || []).length;
src = src.replace(/([?&]v=)\d+/g, `$1${next}`);
fs.writeFileSync(file, src);
console.log(`bumped ${n} refs: v=${cur} -> v=${next}`);
