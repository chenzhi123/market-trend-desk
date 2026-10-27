import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildSnapshot } from "./update.mjs";

const exec = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(root, "data", "snapshot.json");

function stable(snapshot) {
  return JSON.stringify({
    deskDate: snapshot.deskDate,
    macro: snapshot.macro,
    events: snapshot.events.map((event) => [event.date, event.title, event.timing]),
    indices: snapshot.indices.map((index) => ({
      id: index.id,
      asOf: index.asOf || null,
      close: index.close || null,
      error: index.error || null,
      quarters: index.quarters
        ? Object.fromEntries(Object.entries(index.quarters).map(([id, call]) => [id, call.score]))
        : null,
    })),
  });
}

function gitEnv() {
  const env = { ...process.env };
  if (process.env.GIT_AUTHOR_NAME) {
    env.GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME;
    env.GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL;
    env.GIT_COMMITTER_NAME = process.env.GIT_COMMITTER_NAME || process.env.GIT_AUTHOR_NAME;
    env.GIT_COMMITTER_EMAIL = process.env.GIT_COMMITTER_EMAIL || process.env.GIT_AUTHOR_EMAIL;
  }
  return env;
}

async function git(args) {
  try {
    const { stdout } = await exec("git", args, { cwd: root, windowsHide: true, env: gitEnv() });
    return stdout.trim();
  } catch (error) {
    const detail = `${error.stderr || ""}${error.stdout || ""}`.trim();
    const wrapped = new Error(detail || error.message);
    wrapped.code = error.code;
    throw wrapped;
  }
}

async function pushHead() {
  try {
    await git(["push", "origin", "HEAD"]);
  } catch {
    await git(["pull", "--rebase", "--autostash", "-X", "theirs", "origin", "main"]);
    await git(["push", "origin", "HEAD"]);
  }
}

async function commitSnapshot(message) {
  await git(["add", "data/snapshot.json"]);
  try {
    await git(["diff", "--staged", "--quiet"]);
    console.log("行情文件没有变化");
    return;
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  await git(["commit", "-m", message]);
  await pushHead();
  console.log("已发布到远程页面");
}

async function main() {
  const started = new Date().toISOString();
  console.log(`开始刷新 ${started}`);
  await git(["pull", "--rebase", "--autostash", "origin", "main"]);
  const snapshot = await buildSnapshot();
  const failed = snapshot.indices.filter((index) => index.error);
  const macroMissing = !snapshot.macro.us10y || !snapshot.macro.dxy || !snapshot.macro.sox;
  if (failed.length || macroMissing) {
    for (const index of failed) console.error(`${index.name} ${index.error}`);
    if (macroMissing) console.error("宏观序列不完整，本次不发布");
    process.exitCode = 1;
    return;
  }
  for (const index of snapshot.indices) {
    const current = snapshot.quarters[0];
    const call = index.quarters[current.id];
    console.log(`${index.name} ${index.close} ${index.asOf} ${call.label}${call.lean || ""} ${call.score}`);
  }

  let previous = null;
  try {
    previous = JSON.parse(await readFile(snapshotPath, "utf8"));
  } catch {
    previous = null;
  }
  if (previous && stable(previous) === stable(snapshot)) {
    console.log("收盘数据没有变化");
    await pushHead();
    return;
  }

  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
  await commitSnapshot(`更新收盘行情 ${snapshot.deskDate}`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
