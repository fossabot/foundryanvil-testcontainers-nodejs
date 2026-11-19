/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  // Only crawl our own folders: node_modules contains the `npm link` symlink
  // back to the library checkout (which contains this project).
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: "\\.test\\.ts$",
  globalSetup: "<rootDir>/test/support/global-setup.cjs",
  // `--no-docker`: run every AnvilContainer as a local anvil process.
  setupFiles: ["<rootDir>/test/support/setup-runtime.ts"],
  moduleFileExtensions: ["ts", "js", "cjs", "json"],
  // `npm run test:unit -- --coverage`: the reusable example code in src/
  // (test support is exercised by the e2e workflows).
  collectCoverageFrom: ["src/**/*.ts"],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: { branches: 90, functions: 95, lines: 95, statements: 95 },
  },
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { target: "es2022", parser: { syntax: "typescript" } },
        module: { type: "commonjs" },
      },
    ],
  },
};
