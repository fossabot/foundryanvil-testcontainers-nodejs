import * as fs from "node:fs";
import * as path from "node:path";
import type { Abi } from "viem";
import { HexString } from "../types";

/** Default artifacts directory, relative to the cwd. */
export const DEFAULT_ARTIFACTS_DIR = path.join("test", "artifacts");

const ERRORS: Record<string, string> = {
  ENOENT: "file not found at",
  EACCES: "file is not readable (permission denied) at",
  EISDIR: "location is a directory, not a file:",
};

function read(
  location: string,
  artifactsDir: string,
  kind: string,
): { fullPath: string; text: string } {
  if (typeof location !== "string" || location.trim().length === 0) {
    throw new TypeError("An artifact location is required");
  }
  const fullPath = path.resolve(artifactsDir, location);
  try {
    return { fullPath, text: fs.readFileSync(fullPath, "utf8") };
  } catch (error: unknown) {
    const reason = ERRORS[(error as NodeJS.ErrnoException).code ?? ""];
    throw reason ? new Error(`${kind} ${reason} ${fullPath}`) : error;
  }
}

function parseJson(text: string, fullPath: string, kind: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    throw new Error(
      `${kind} file at ${fullPath} is not valid JSON: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

/**
 * Loads an ABI from a JSON file: a plain ABI array or a Hardhat/Foundry
 * artifact with an `abi` property.
 * @param location Absolute, or relative to `artifactsDir` (default `<cwd>/test/artifacts`).
 */
export function loadContractAbi(
  location: string,
  artifactsDir: string = DEFAULT_ARTIFACTS_DIR,
): Abi {
  const { fullPath, text } = read(location, artifactsDir, "ABI");
  const parsed = parseJson(text, fullPath, "ABI") as
    { abi?: unknown } | unknown[];
  const abi = Array.isArray(parsed) ? parsed : parsed?.abi;
  if (!Array.isArray(abi)) {
    throw new Error(
      `ABI file at ${fullPath} must contain an ABI array or an object with an "abi" array`,
    );
  }
  return abi as Abi;
}

/**
 * Loads creation bytecode from a hex `.bin` file or a Hardhat/Foundry JSON
 * artifact (`bytecode` or `bytecode.object`); adds `0x` when missing.
 * @param location Absolute, or relative to `artifactsDir` (default `<cwd>/test/artifacts`).
 */
export function loadContractBytecode(
  location: string,
  artifactsDir: string = DEFAULT_ARTIFACTS_DIR,
): HexString {
  const { fullPath, text } = read(location, artifactsDir, "Bytecode");
  let hex = text.trim();
  if (hex.startsWith("{")) {
    const { bytecode } = parseJson(hex, fullPath, "Bytecode") as {
      bytecode?: string | { object?: string };
    };
    hex = (typeof bytecode === "string" ? bytecode : bytecode?.object) ?? "";
  }
  if (!hex.startsWith("0x")) hex = `0x${hex}`;
  if (!/^0x([0-9a-fA-F]{2})+$/.test(hex)) {
    throw new Error(
      `Bytecode file at ${fullPath} does not contain valid hex bytecode`,
    );
  }
  return hex as HexString;
}
