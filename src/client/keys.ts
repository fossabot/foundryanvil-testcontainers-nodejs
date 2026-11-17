import { pbkdf2Sync } from "node:crypto";
import { toHex } from "viem";
import { HDKey } from "viem/accounts";
import type { HexString } from "../types";

/**
 * @internal Keys of anvil's dev accounts (`${derivationPath}${index}`). The
 * BIP-39 seed is computed once with native PBKDF2 and the parent node derived
 * once – ~40× faster than per-account `mnemonicToAccount`.
 */
export function deriveAccountKeys(
  mnemonic: string,
  derivationPath: string,
  count: number,
): HexString[] {
  const seed = pbkdf2Sync(
    mnemonic.normalize("NFKD"),
    "mnemonic",
    2048,
    64,
    "sha512",
  );
  const master = HDKey.fromMasterSeed(seed);
  const parent = derivationPath.endsWith("/")
    ? master.derive(derivationPath.slice(0, -1))
    : undefined;
  return Array.from({ length: count }, (_, index) =>
    toHex(
      (parent
        ? parent.deriveChild(index)
        : master.derive(`${derivationPath}${index}`)
      ).privateKey!,
    ),
  );
}

/** @internal Private keys from anvil's "Private Keys" banner, in index order. */
export function parsePrivateKeysFromBanner(
  text: string,
): HexString[] | undefined {
  const start = text.indexOf("Private Keys");
  if (start === -1) return undefined;
  const keys: HexString[] = [];
  for (const [, index, key] of text
    .slice(start)
    .matchAll(/\((\d+)\)\s+(0x[0-9a-fA-F]{64})/g)) {
    if (Number(index) !== keys.length) break;
    keys.push(key as HexString);
  }
  return keys.length > 0 ? keys : undefined;
}
