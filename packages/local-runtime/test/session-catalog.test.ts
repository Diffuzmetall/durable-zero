import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSessionCatalog } from "../src/sessions.ts";

for (const scenario of ["preserve omitted extensions", "recover interrupted creation", "reject occupied destination"] as const) {
  test(`session catalog: ${scenario}`, async t => {
    const base = await mkdtemp(join(tmpdir(), "zero-catalog-"));
    t.after(() => rm(base, { recursive: true, force: true }));
    const original = join(base, "original"); await mkdir(original);
    const extension = join(base, "provider.ts");
    const catalog = await openSessionCatalog(original, base, [extension]);
    if (scenario === "preserve omitted extensions") {
      const reopened = await openSessionCatalog(original, base);
      assert.deepEqual((await reopened.describe(original)).extensions, [extension]);
      assert.deepEqual((await reopened.create(randomUUID())).extensions, [extension]);
      const cleared = await openSessionCatalog(original, base, []);
      assert.deepEqual((await cleared.describe(original)).extensions, [], "explicit empty options still clear configuration");
      return;
    }
    const requestId = randomUUID();
    const destination = join(base, Buffer.from(requestId.replaceAll("-", ""), "hex").toString("base64url"));
    await mkdir(destination);
    if (scenario === "recover interrupted creation") {
      const created = await catalog.create(requestId);
      assert.equal(created.id, destination);
      assert.deepEqual(await catalog.create(requestId), created);
      assert.equal((await catalog.list()).length, 2);
      assert.deepEqual((await readdir(join(original, ".terminal"))).filter(name => name.startsWith("new-")), []);
    } else {
      const foreign = join(destination, "keep.txt"); await writeFile(foreign, "preserve");
      await assert.rejects(catalog.create(requestId));
      assert.equal(await readFile(foreign, "utf8"), "preserve");
      assert.deepEqual(await readdir(destination), ["keep.txt"]);
      assert.deepEqual((await readdir(join(original, ".terminal"))).filter(name => name.startsWith("new-")), [], "failed publication cleans only its own staging directory");
    }
  });
}
