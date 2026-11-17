/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  // Only crawl our own folders: node_modules contains the `npm link` symlink
  // back to the library checkout (which contains this project).
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: "\\.test\\.ts$",
  globalSetup: "<rootDir>/test/support/global-setup.cjs",
  moduleFileExtensions: ["ts", "js", "cjs", "json"],
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
