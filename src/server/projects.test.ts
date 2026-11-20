import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { defaultComposition } from "@/lib/composition";

// An in-memory SQLite with the app's migrations stands in for D1.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const p = await import("./projects");

const ana = { id: "ana", email: "ana@example.test", orgId: "org", admin: false };
const ben = { id: "ben", email: "ben@example.test", orgId: "org", admin: false };
const boss = { id: "boss", email: "boss@example.test", orgId: "org", admin: true };
const stranger = { id: "eve", email: "eve@example.test", orgId: "other", admin: false };
const preview = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  testDb.current = db;
  for (const actor of [ana, ben, boss, stranger]) await p.rememberUser(actor);
});

describe("projects", () => {
  it("belong to their owner", async () => {
    const { id } = await p.createProject(ana, { title: "Mine" });
    expect((await p.listProjects(ana)).map((x) => x.id)).toContain(id);
    expect(await p.listProjects(ben)).toEqual([]);
    await expect(p.getProject(ben, id)).rejects.toThrow("not found");
    await expect(p.renameProject(ben, { id, title: "Taken" })).rejects.toThrow();
    await expect(
      p.saveDesign(ben, { id, composition: defaultComposition(), preview }),
    ).rejects.toThrow();
    await expect(p.deleteProject(boss, { id })).rejects.toThrow();
    expect((await p.getProject(ana, id)).title).toBe("Mine");
  });

  it("are shared as viewer or editor, only by the owner", async () => {
    const { id } = await p.createProject(ana, { title: "Shared" });
    await p.shareProject(ana, { id, email: "ben@example.test", role: "viewer" });
    expect((await p.getProject(ben, id)).access).toBe("viewer");
    await expect(
      p.saveDesign(ben, { id, composition: defaultComposition(), preview }),
    ).rejects.toThrow();
    await expect(
      p.shareProject(ben, { id, email: "boss@example.test", role: "editor" }),
    ).rejects.toThrow();
    await expect(
      p.shareProject(ana, { id, email: "eve@example.test", role: "editor" }),
    ).rejects.toThrow();

    await p.shareProject(ana, { id, email: "ben@example.test", role: "editor" });
    const changed = { ...defaultComposition(), text: "سلام" };
    await p.saveDesign(ben, { id, composition: changed, preview });
    expect((await p.getProject(ana, id)).composition.text).toBe("سلام");
    await expect(p.renameProject(ben, { id, title: "No" })).rejects.toThrow();

    await p.unshareProject(ana, { id, userId: "ben" });
    await expect(p.getProject(ben, id)).rejects.toThrow();
    await p.deleteProject(ana, { id });
    expect(await p.listProjects(ana)).not.toContainEqual(
      expect.objectContaining({ id }),
    );
  });

  it("publish as templates any member can copy", async () => {
    const { id } = await p.createProject(ana, { title: "Template" });
    await expect(p.setTemplate(ben, { id, published: true })).rejects.toThrow();
    await p.setTemplate(ana, { id, published: true });
    expect((await p.listTemplates(ben)).map((t) => t.id)).toContain(id);
    expect((await p.getProject(ben, id)).access).toBe("template");

    const copy = await p.copyProject(ben, { id });
    const mine = await p.getProject(ben, copy.id);
    expect(mine.access).toBe("owner");
    expect(mine.title).toBe("Template");

    await expect(p.setTemplate(ben, { id, published: false })).rejects.toThrow();
    await p.setTemplate(boss, { id, published: false });
    expect((await p.listTemplates(ben)).map((t) => t.id)).not.toContain(id);
  });
});
