import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadPlugin } from "./vm.mjs";

const evalIn = loadPlugin();

test("images are well formed", () => {
  const b = evalIn(`badge('a<b>&"c', 'online', GREEN)`);
  assert.ok(b.startsWith("<svg ") && b.endsWith("</svg>"));
  assert.ok(b.includes("a&lt;b&gt;&amp;&quot;c") && !b.includes("<b>"), "names cannot break out of the image");
  assert.equal(evalIn("[percent(100).text, percent(99.999).text, percent(97.5).text, percent(null).text].join(' ')"), "100% 99.99% 97.50% –");
  assert.equal(evalIn("[percent(100).color === GREEN, percent(97.5).color === AMBER, percent(80).color === RED].join()"), "true,true,true");
  assert.equal(evalIn("fit('a very long node name indeed', 60, 11)"), "a very …");
  assert.equal(evalIn("[size(0), size(1536), size(5 * 1024 * 1024)].join(' ')"), "0B 1.5K 5.0M");
  // A node with a report draws its bars; without usage it is name and state only.
  const node =
    "{id:1,uuid:'u',name:'东京 <1>',online:true,region:'JP',os:'Debian'," +
    "live:{report:{cpu:42,mem_used:1,mem_total:4,disk_used:9,disk_total:10,net_rx:2048,net_tx:1024}}}";
  const card = evalIn(`card(${node}, {usage:true}, true, THEMES.dark)`);
  assert.ok(card.includes("东京 &lt;1&gt;") && card.includes(">42%<") && card.includes(">90%<") && card.includes("在线"));
  assert.ok(!evalIn(`card(${node}, {usage:false}, false, THEMES.light)`).includes("42%"));
  const board = evalIn(
    `board({usage:true,limit:1,site:{name:'Site'}}, [${node}, Object.assign({}, ${node}, {online:false,live:{}})], false, THEMES.light, '09:05')`,
  );
  assert.ok(board.includes("1 / 2 online · 09:05") && board.includes("and 1 more"));
  assert.equal(evalIn("[status({online:false,live:{maintenance:true}}, true).text, status({online:false,live:{}}, false).text].join()"), "维护中,offline");
});

test("the font ships with its license", () => {
  const fonts = fs.readdirSync(new URL("../fonts/", import.meta.url));
  assert.ok(fonts.some((f) => /\.(ttf|otf|ttc)$/i.test(f)));
  assert.ok(fonts.includes("OFL.txt"));
});

test("the image address prefix", () => {
  assert.equal(evalIn("base(' https://img.example.com/s/ ')"), "https://img.example.com/s");
  assert.equal(evalIn("base('http://example.com')"), "http://example.com");
  assert.equal(evalIn("[base(''), base(undefined), base('javascript:alert(1)'), base('example.com/x'), base('https://a.com/x?y=1')].join('|')"), "||||");
});

test("images do not depend on the site being public", () => {
  assert.ok(!fs.readFileSync(new URL("../main.js", import.meta.url), "utf8").includes("site.private"));
});
