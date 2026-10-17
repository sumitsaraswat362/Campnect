import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoServer } from "./serve-demo.mjs";

test("production demo static server: SPA, assets, no backend, ranges and security", async () => {
  const root = await mkdtemp(join(tmpdir(), "campnect-static-"));
  await writeFile(join(root, "index.html"), "<html>Campnect Demo</html>");
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "assets/app.js"), "demo=true;");
  await writeFile(join(root, "clip.mp4"), "0123456789");
  await symlink("/etc/passwd", join(root, "escape.txt"));
  const server = createDemoServer(root);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ["/", "/login", "/app/feed", "/app/profile", "/app/profile/kabir.mehta", "/app/chat/chat0", "/app/settings"]) {
      const response = await fetch(url + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(await response.text(), /Campnect Demo/);
      assert.match(response.headers.get("content-security-policy"), /connect-src 'self' blob: data:/);
    }
    const asset = await fetch(url + "/assets/app.js");
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.equal(await asset.text(), "demo=true;");
    for (const path of ["/api/healthz", "/socket.io/", "/uploads/file", "/assets/missing.js", "/demo/missing", "/escape.txt"]) {
      assert.ok([403, 404].includes((await fetch(url + path)).status), path);
    }
    assert.equal((await fetch(url + "/app/feed", { method: "HEAD" })).status, 200);
    assert.equal((await fetch(url + "/api/auth/login", { method: "POST" })).status, 405);
    const range = await fetch(url + "/clip.mp4", { headers: { Range: "bytes=2-5" } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "2345");
    assert.equal((await fetch(url + "/clip.mp4", { headers: { Range: "bytes=99-" } })).status, 416);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
