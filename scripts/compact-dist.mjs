#!/usr/bin/env node
/**
 * Post-build step: strips comments and whitespace from the JS bundles.
 * Names are NOT mangled so class/function names in consumers' stack traces
 * stay readable. JSDoc lives in the .d.ts files, where editors read it.
 */
import { minify } from "@swc/core";
import * as fs from "node:fs";

for (const file of ["dist/index.js", "dist/index.cjs"]) {
  const before = fs.statSync(file).size;
  const { code } = await minify(fs.readFileSync(file, "utf8"), {
    compress: false,
    mangle: false,
    format: { comments: false },
    module: file.endsWith(".js"),
    sourceMap: false,
  });
  fs.writeFileSync(file, `${code}\n`);
  console.log(`${file}: ${(before / 1024).toFixed(1)} kB → ${(code.length / 1024).toFixed(1)} kB`);
}
