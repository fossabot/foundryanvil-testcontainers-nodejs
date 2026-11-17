/**
 * Runs once before any test file: without the `npm link`, every suite would
 * fail with a bare "Cannot find module". Fail once, with the fix instead.
 */
module.exports = async function checkLibraryLink() {
  const { isLinked, libraryPath, PACKAGE_NAME } =
    await import("../../scripts/link-library.mjs");
  if (!isLinked()) {
    throw new Error(
      `${PACKAGE_NAME} is not linked to ${libraryPath()}. ` +
        "Run `npm run link:library` (npm install / npm ci remove links), " +
        "or `pnpm examples:test` from the repository root.",
    );
  }
};
