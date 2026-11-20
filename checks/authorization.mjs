// Authorization: private paths, ownership, sharing roles, admin-only unpublish, no sign-in of its own.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, waitForCanvas, waitSaved, setText, captureServerCall, replay, row } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/templates", "/health"]);

  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");

  // An owner's private project.
  const id = await createProject(owner, "Private Draft");
  await setText(owner, "سلام");
  await waitSaved(owner);

  // Anonymous and outsider callers never reach it.
  for (const role of [undefined, "outsider"]) {
    const res = await runtime.fetch(`/projects/${id}`, { role });
    expect([401, 403]).toContain(res.status);
  }

  // Another member can neither see nor open it.
  await member.goto("/");
  await expect(member.getByTestId("projects-empty")).toBeVisible();
  await member.goto(`/projects/${id}`);
  await expect(member.getByTestId("project-not-found")).toBeVisible();
  await expect(member.getByTestId("canvas")).toHaveCount(0);

  // Replaying the owner's own calls as the member changes nothing.
  const rename = await captureServerCall(owner, async () => {
    await owner.getByTestId("project-menu").click();
    await owner.getByRole("menuitem", { name: "Rename" }).click();
    await owner.getByTestId("project-title-input").fill("Private Draft 2");
    await owner.getByTestId("project-title-submit").click();
  });
  await expect(owner.getByRole("heading", { level: 1, name: "Private Draft 2" })).toBeVisible();
  const save = await captureServerCall(owner, () => owner.getByTestId("text-input").fill("سلام عليكم"));
  await waitSaved(owner);

  await owner.getByTestId("text-input").fill("سلام");
  await waitSaved(owner);
  await owner.getByTestId("project-menu").click();
  await owner.getByRole("menuitem", { name: "Rename" }).click();
  await owner.getByTestId("project-title-input").fill("Private Draft");
  await owner.getByTestId("project-title-submit").click();
  await expect(owner.getByRole("heading", { level: 1, name: "Private Draft" })).toBeVisible();

  for (const call of [rename, save]) {
    const res = await replay(runtime, call, "member");
    expect(res.ok).toBe(false);
  }
  let stored = await row(runtime, "select title, composition from projects where id = ?", id);
  expect(stored.title).toBe("Private Draft");
  expect(stored.composition).not.toContain("عليكم");

  // A viewer reads but cannot change.
  await owner.getByTestId("share-button").click();
  const share = await captureServerCall(owner, async () => {
    await owner.getByTestId("share-email").fill("member@example.test");
    await owner.getByTestId("share-submit").click();
  });
  await expect(owner.getByTestId("share-row")).toContainText("Viewer");
  await owner.keyboard.press("Escape");
  await member.goto(`/projects/${id}`);
  await waitForCanvas(member);
  await expect(member.getByTestId("view-only")).toBeVisible();
  await expect(member.getByTestId("text-input")).toHaveCount(0);
  for (const call of [rename, save]) {
    expect((await replay(runtime, call, "member")).ok).toBe(false);
  }
  stored = await row(runtime, "select title, composition from projects where id = ?", id);
  expect(stored.title).toBe("Private Draft");
  expect(stored.composition).not.toContain("عليكم");

  // A recipient cannot share onward: replaying the owner's share call as the member is refused.
  expect((await replay(runtime, share, "member")).ok).toBe(false);

  // An editor changes the design but not the title, shares or the project itself.
  await owner.getByTestId("share-button").click();
  await owner.getByTestId("share-email").fill("member@example.test");
  await owner.getByTestId("share-role-editor").click();
  await owner.getByTestId("share-submit").click();
  await expect(owner.getByTestId("share-row")).toContainText("Editor");
  await owner.keyboard.press("Escape");
  await member.reload();
  await waitForCanvas(member);
  await expect(member.getByTestId("project-menu")).toHaveCount(0);
  await expect(member.getByTestId("publish-button")).toHaveCount(0);
  expect((await replay(runtime, rename, "member")).ok).toBe(false);
  stored = await row(runtime, "select title from projects where id = ?", id);
  expect(stored.title).toBe("Private Draft");
  await setText(member, "سلام عليكم");
  await waitSaved(member);
  stored = await row(runtime, "select composition from projects where id = ?", id);
  expect(stored.composition).toContain("عليكم");

  // The owner (an admin) has no reach into a member's private project.
  const memberId = await createProject(member, "Member Sketch");
  await owner.goto(`/projects/${memberId}`);
  await expect(owner.getByTestId("project-not-found")).toBeVisible();
  await owner.goto("/");
  await expect(owner.getByTestId("project-card")).toHaveCount(1);

  // Templates: only the owner or an admin unpublishes.
  await owner.goto(`/projects/${id}`);
  await waitForCanvas(owner);
  await owner.getByTestId("publish-button").click();
  await expect(owner.getByTestId("unpublish-button")).toBeVisible();
  const unpublish = await captureServerCall(owner, () => owner.getByTestId("unpublish-button").click());
  await expect(owner.getByTestId("publish-button")).toBeVisible();
  await owner.getByTestId("publish-button").click();
  await expect(owner.getByTestId("unpublish-button")).toBeVisible();

  await member.goto("/templates");
  await expect(member.getByTestId("template-card")).toHaveCount(1);
  await expect(member.getByTestId("template-unpublish")).toHaveCount(0);
  expect((await replay(runtime, unpublish, "member")).ok).toBe(false);
  expect((await row(runtime, "select is_template from projects where id = ?", id)).is_template).toBe(1);

  // A member's own template: they and the admin may unpublish it.
  await member.goto(`/projects/${memberId}`);
  await waitForCanvas(member);
  await member.getByTestId("publish-button").click();
  await expect(member.getByTestId("unpublish-button")).toBeVisible();
  await owner.goto("/templates");
  const memberCard = owner.getByTestId("template-card").filter({ hasText: "Member Sketch" });
  await memberCard.getByTestId("template-unpublish").click();
  await expect(memberCard).toHaveCount(0);
  expect((await row(runtime, "select is_template from projects where id = ?", memberId)).is_template).toBe(0);

  // A template is readable by everyone, but not changeable by them.
  await member.goto("/templates");
  await expect(member.getByTestId("template-card")).toHaveCount(1);
  await owner.goto(`/projects/${id}`);
  await waitForCanvas(owner);
  await owner.getByTestId("share-button").click();
  await owner.getByTestId("share-remove").click();
  await expect(owner.getByTestId("share-row")).toHaveCount(0);
  await owner.keyboard.press("Escape");
  await member.goto(`/projects/${id}`);
  await waitForCanvas(member);
  await expect(member.getByTestId("view-only")).toBeVisible();
  expect((await replay(runtime, save, "member")).ok).toBe(false);
  expect((await row(runtime, "select composition from projects where id = ?", id)).composition).toContain("عليكم");

  // Delete is the owner's alone.
  const del = await (async () => {
    const scratch = await createProject(owner, "Scratch");
    await owner.getByTestId("project-menu").click();
    await owner.getByRole("menuitem", { name: "Delete" }).click();
    const call = await captureServerCall(owner, () => owner.getByTestId("confirm-delete").click());
    return { call, scratch };
  })();
  expect(await row(runtime, "select id from projects where id = ?", del.scratch)).toBeNull();
  // The captured call names the deleted project; pointing it at the shared project must still be refused.
  const forged = { ...del.call, body: del.call.body.replaceAll(del.scratch, id) };
  expect((await replay(runtime, forged, "member")).ok).toBe(false);
  expect(await row(runtime, "select id from projects where id = ?", id)).not.toBeNull();

  // No sign-in page of its own.
  for (const path of ["/login", "/signin", "/signup", "/register"]) {
    const res = await runtime.fetch(path, { role: "member" });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/type="password"/);
  }
  await owner.goto("/");
  await expect(owner.locator('input[type="password"]')).toHaveCount(0);
} finally {
  await runtime.close();
}
