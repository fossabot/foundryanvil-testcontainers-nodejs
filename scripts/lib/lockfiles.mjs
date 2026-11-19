/**
 * Platform completeness of the repository's lockfiles.
 *
 * Native tools (anvil, swc, rollup, unrs-resolver, …) ship one npm package
 * per platform as optional dependencies. A lockfile only installs the
 * binaries it records, so it must record them for every platform the gate
 * runs on — macOS and Linux — even when it was last resolved somewhere that
 * only has some of them (e.g. a registry mirror carrying Linux x64 builds
 * only: pnpm and npm silently drop optional packages they cannot resolve).
 *
 * - `checkLockfile()` reports native packages missing required platforms;
 * - `restorePnpmLock()` / `restoreNpmLock()` put pruned platform entries
 *   back from an earlier lockfile (same versions, original integrity).
 */

/** Platforms every native package must cover: macOS and Linux, ARM and x64. */
export const REQUIRED_PLATFORMS = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
]);

// ------------------------------------------------------------------ pnpm

/** `{ key, text }` blocks of a top-level lockfile section (`packages`, `snapshots`). */
function sectionBlocks(lock, name) {
  const start = lock.indexOf(`\n${name}:\n`);
  if (start === -1) return { start: -1, end: -1, blocks: [] };
  const bodyStart = start + name.length + 3;
  const next = lock.slice(bodyStart).search(/\n[a-zA-Z]/);
  const end = next === -1 ? lock.length : bodyStart + next + 1;
  const blocks = lock
    .slice(bodyStart, end)
    .split(/\n\n/)
    .map((text) => text.replace(/^\n+|\n+$/g, ""))
    .filter(Boolean)
    .map((text) => ({ key: blockKey(text), text }));
  return { start: bodyStart, end, blocks };
}

/** Key of a block: `'@scope/name@1.0.0':` or `name@1.0.0: {}`. */
function blockKey(text) {
  const match = /^\s*('[^']+'|[^\s:]+):/.exec(text);
  return unquote(match ? match[1] : text.trim());
}

function unquote(value) {
  return value.replace(/^'(.*)'$/, "$1");
}

/** `name` of a `name@version` key (scoped names keep their leading `@`). */
function nameOf(key) {
  return key.slice(0, key.indexOf("@", 1));
}

function listField(text, field) {
  const match = new RegExp(`\\n\\s+${field}: \\[([^\\]]*)\\]`).exec(text);
  return match ? match[1].split(",").map((item) => item.trim()) : [];
}

/** The optionalDependencies of a snapshot block, as `name → version`. */
function optionalDependencies(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === "    optionalDependencies:");
  const result = new Map();
  if (start === -1) return result;
  for (const line of lines.slice(start + 1)) {
    const entry = /^ {6}('?[^']+'?|\S+): (.+)$/.exec(line);
    if (!entry) break;
    result.set(unquote(entry[1]), entry[2]);
  }
  return result;
}

function withOptionalDependencies(text, entries) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === "    optionalDependencies:");
  let end = start + 1;
  while (end < lines.length && /^ {6}\S/.test(lines[end])) end++;
  const rendered = [...entries]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([name, version]) =>
        `      ${/^[\w-]+$/.test(name) ? name : `'${name}'`}: ${version}`,
    );
  lines.splice(start + 1, end - start - 1, ...rendered);
  return lines.join("\n");
}

function renderSection(lock, section, blocks) {
  const sorted = [...blocks].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  const body = sorted.map((block) => block.text).join("\n\n");
  const trailing = section.end === lock.length ? "\n" : "\n\n";
  return `${lock.slice(0, section.start)}\n${body}${trailing}${lock.slice(section.end).replace(/^\n+/, "")}`;
}

/** Native packages of a pnpm lockfile: parent key → platform children. */
function pnpmNatives(lock) {
  const packages = new Map(
    sectionBlocks(lock, "packages").blocks.map((b) => [b.key, b.text]),
  );
  const natives = [];
  for (const { key, text } of sectionBlocks(lock, "snapshots").blocks) {
    const children = [...optionalDependencies(text)]
      .map(([name, version]) => {
        const child = `${name}@${version}`;
        const info = packages.get(child) ?? "";
        return {
          key: child,
          name,
          os: listField(info, "os"),
          cpu: listField(info, "cpu"),
          libc: listField(info, "libc"),
        };
      })
      .filter((child) => child.os.length > 0 || child.cpu.length > 0);
    natives.push({ key, children });
  }
  return natives;
}

// ------------------------------------------------------------------- npm

/** Native packages of an npm lockfile (v2/v3): path → platform children. */
function npmNatives(lock) {
  const packages = lock.packages ?? {};
  const resolve = (from, name) => {
    // Node resolution: nearest node_modules up from the parent's path.
    for (
      let base = from;
      ;
      base = base.slice(0, Math.max(0, base.lastIndexOf("/node_modules/")))
    ) {
      const candidate = base
        ? `${base}/node_modules/${name}`
        : `node_modules/${name}`;
      if (packages[candidate]) return candidate;
      if (!base) return undefined;
    }
  };
  return Object.entries(packages)
    .filter(([, entry]) => entry.optionalDependencies)
    .map(([path, entry]) => ({
      key: path || "(root)",
      children: Object.keys(entry.optionalDependencies)
        .map((name) => resolve(path, name))
        .filter(Boolean)
        .map((childPath) => ({
          key: childPath,
          name: childPath.slice(childPath.lastIndexOf("node_modules/") + 13),
          os: packages[childPath].os ?? [],
          cpu: packages[childPath].cpu ?? [],
          libc: packages[childPath].libc ?? [],
        }))
        .filter((child) => child.os.length > 0 || child.cpu.length > 0),
    }));
}

// ---------------------------------------------------------------- checks

const PLATFORM_TOKEN =
  /-(darwin|linux|win32|android|freebsd|openbsd|netbsd|sunos|aix|openharmony)(?=-|$)/;

/**
 * Binary families among platform-specific children, keyed by the name
 * without its platform part (`@swc/core-darwin-arm64` → `@swc/core`).
 * Children without a platform in their name (e.g. `fsevents`, a macOS-only
 * addon) are not binaries of the parent and are left out.
 */
function families(children) {
  const groups = new Map();
  for (const child of children) {
    const token = PLATFORM_TOKEN.exec(child.name);
    if (!token) continue;
    const family = child.name.slice(0, token.index);
    groups.set(family, [...(groups.get(family) ?? []), child]);
  }
  return groups;
}

function covers(child, platform) {
  const [os, cpu] = platform.split("-");
  const ok = (list, value) =>
    list.length === 0 || (list.includes(value) && !list.includes(`!${value}`));
  // Linux needs a glibc build: musl-only binaries do not load on most distros.
  const libc =
    os !== "linux" || child.libc.length === 0 || child.libc.includes("glibc");
  return ok(child.os, os) && ok(child.cpu, cpu) && libc;
}

/**
 * Problems of a lockfile: native binary families that miss a build for a
 * required platform (macOS arm64/x64, Linux x64/arm64 with glibc).
 * @param {"pnpm" | "npm"} kind
 * @param {string} text lockfile content
 */
export function checkLockfile(kind, text) {
  const natives =
    kind === "pnpm" ? pnpmNatives(text) : npmNatives(JSON.parse(text));
  return natives.flatMap(({ key, children }) =>
    [...families(children)].flatMap(([family, binaries]) =>
      REQUIRED_PLATFORMS.filter(
        (platform) => !binaries.some((child) => covers(child, platform)),
      ).map((platform) => `${key}: no ${platform} build of ${family}-*`),
    ),
  );
}

// --------------------------------------------------------------- restore

/**
 * Puts platform packages that `reference` records (with their resolution
 * and integrity) back into `current` wherever `current` still has the same
 * parent version. Returns the new lockfile and the restored keys.
 */
export function restorePnpmLock(current, reference) {
  const refPackages = new Map(
    sectionBlocks(reference, "packages").blocks.map((b) => [b.key, b.text]),
  );
  const refSnapshots = new Map(
    sectionBlocks(reference, "snapshots").blocks.map((b) => [b.key, b.text]),
  );
  const packages = sectionBlocks(current, "packages");
  const snapshots = sectionBlocks(current, "snapshots");
  const have = new Set(packages.blocks.map((block) => block.key));
  const restored = [];

  for (const snapshot of snapshots.blocks) {
    const refText = refSnapshots.get(snapshot.key);
    if (!refText) continue;
    const entries = optionalDependencies(snapshot.text);
    let changed = false;
    for (const [name, version] of optionalDependencies(refText)) {
      const key = `${name}@${version}`;
      const refPackage = refPackages.get(key);
      const platformSpecific =
        refPackage &&
        (listField(refPackage, "os").length > 0 ||
          listField(refPackage, "cpu").length > 0);
      if (!platformSpecific || entries.has(name)) continue;
      entries.set(name, version);
      changed = true;
      if (!have.has(key)) {
        have.add(key);
        packages.blocks.push({ key, text: refPackage });
        snapshots.blocks.push({
          key,
          text: refSnapshots.get(key) ?? `  '${key}':\n    optional: true`,
        });
        restored.push(key);
      }
    }
    if (changed)
      snapshot.text = withOptionalDependencies(snapshot.text, entries);
  }
  // Render snapshots first: it comes after packages, so offsets stay valid.
  let next = renderSection(current, snapshots, snapshots.blocks);
  next = renderSection(next, sectionBlocks(next, "packages"), packages.blocks);
  return { lock: next, restored: restored.sort() };
}

/**
 * npm variant of {@link restorePnpmLock}: entries of `reference` with
 * `os` / `cpu` whose parent has the same version in `current` are inserted
 * after their predecessor in `reference` (npm's own order).
 */
export function restoreNpmLock(current, reference) {
  const lock = JSON.parse(current);
  const ref = JSON.parse(reference);
  const refKeys = Object.keys(ref.packages);
  const restored = [];
  for (const [path, entry] of Object.entries(ref.packages)) {
    if (lock.packages[path] || !(entry.os || entry.cpu)) continue;
    const name = path.slice(
      path.lastIndexOf("node_modules/") + "node_modules/".length,
    );
    const parent = Object.entries(ref.packages).find(
      ([parentPath, parentEntry]) =>
        parentEntry.optionalDependencies?.[name] !== undefined &&
        lock.packages[parentPath]?.version === parentEntry.version,
    );
    if (parent) restored.push(path);
  }
  if (restored.length === 0) return { lock: current, restored };
  const wanted = new Set([...Object.keys(lock.packages), ...restored]);
  const order = [...Object.keys(lock.packages)];
  for (const path of restored) {
    // Insert after the nearest preceding key of the reference that is present.
    let index = refKeys.indexOf(path) - 1;
    while (index >= 0 && !order.includes(refKeys[index])) index--;
    order.splice(
      index >= 0 ? order.indexOf(refKeys[index]) + 1 : order.length,
      0,
      path,
    );
  }
  lock.packages = Object.fromEntries(
    order
      .filter((path) => wanted.has(path))
      .map((path) => [path, lock.packages[path] ?? ref.packages[path]]),
  );
  return {
    lock: `${JSON.stringify(lock, null, 2)}\n`,
    restored: restored.sort(),
  };
}
