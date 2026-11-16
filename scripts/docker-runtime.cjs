"use strict";
/** Best-effort synchronous detection of a Docker-compatible container runtime. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function isDockerAvailable(env = process.env) {
  if (env.DOCKER_HOST || env.TESTCONTAINERS_HOST_OVERRIDE) return true;
  const home = os.homedir();
  const runtimeDir = env.XDG_RUNTIME_DIR || "";
  return [
    "/var/run/docker.sock",
    path.join(home, ".docker", "run", "docker.sock"),
    path.join(home, ".docker", "desktop", "docker.sock"),
    path.join(home, ".colima", "default", "docker.sock"),
    path.join(home, ".rd", "docker.sock"),
    "/run/podman/podman.sock",
    runtimeDir && path.join(runtimeDir, "podman", "podman.sock"),
    runtimeDir && path.join(runtimeDir, "docker.sock"),
  ].some((candidate) => Boolean(candidate) && fs.existsSync(candidate));
}

module.exports = { isDockerAvailable };
