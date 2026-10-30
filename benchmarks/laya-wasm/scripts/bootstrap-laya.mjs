import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const revision="b9fe351ce81e2d974bca2bf219c1e4030c0a05ea";
const root=path.resolve("vendor/laya");
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,stdio:"inherit"});
fs.mkdirSync(path.dirname(root),{recursive:true});
if (!fs.existsSync(path.join(root,".git"))) {
  run("git",["clone","https://github.com/NandhaKishorM/laya.git",root],process.cwd());
}
run("git",["checkout","--detach",revision],root);
const work=path.join(root,"laya-ts");
run("npm",["install","--no-audit","--no-fund"],work);
run("npm",["run","build"],work);
console.log("Pinned upstream laya-ts built at",revision);
