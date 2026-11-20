// Behavior: every frozen feature's main path, through the packaged release.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, waitForCanvas, waitSaved, setText, letter, openTab, exportAs, row } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  // Server route: the JSON health check answers members.
  const health = await runtime.fetch("/health", { role: "member" });
  expect(health.status).toBe(200);
  expect((await health.json()).ok).toBe(true);

  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();

  // F001: empty list offers to create a project.
  await owner.goto("/");
  await runtime.assertBackLink(owner);
  await expect(owner.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(owner.getByTestId("projects-empty")).toBeVisible();
  await member.goto("/"); // the member has now opened the app, so they can be shared with

  const id = await createProject(owner, "Wedding Invitation");
  await expect(owner.getByRole("heading", { level: 1, name: "Wedding Invitation" })).toBeVisible();

  // F002: text is shaped with joining forms: one letter repeated takes three forms.
  await setText(owner, "ببب");
  await expect(owner.getByTestId("letter")).toHaveCount(3);
  const gids = await owner.getByTestId("letter").evaluateAll((els) => els.map((e) => e.getAttribute("data-gid")));
  expect(new Set(gids).size).toBe(3);

  await setText(owner, "بسم الله\nالرحمن الرحيم");
  await expect(letter(owner, "1:0")).toBeVisible();
  const line0 = await letter(owner, "0:0").boundingBox();
  const line1 = await letter(owner, "1:0").boundingBox();
  expect(line1.y).toBeGreaterThan(line0.y);

  // Style changes the letter shapes.
  const naskhPath = await letter(owner, "0:0").locator("path").first().getAttribute("d");
  await owner.getByTestId("style-ruqah").click();
  await waitForCanvas(owner);
  await expect(owner.getByTestId("canvas")).toHaveAttribute("data-style", "ruqah");
  expect(await letter(owner, "0:0").locator("path").first().getAttribute("d")).not.toBe(naskhPath);
  for (const style of ["nastaliq", "kufi", "naskh"]) {
    await owner.getByTestId(`style-${style}`).click();
    await waitForCanvas(owner);
    await expect(owner.getByTestId("canvas")).toHaveAttribute("data-style", style);
    await expect(letter(owner, "0:0")).toBeVisible();
  }

  // Size, colour and line arrangement.
  const before = await letter(owner, "0:0").boundingBox();
  await owner.getByTestId("size-input").fill("200");
  await expect.poll(async () => (await letter(owner, "0:0").boundingBox()).height).toBeGreaterThan(before.height * 1.1);
  await owner.getByTestId("color-input").fill("#1d4e89");
  await expect(letter(owner, "0:1")).toHaveAttribute("fill", "#1d4e89");
  await owner.getByTestId("align-right").click();
  await expect.poll(async () => {
    const a = await owner.getByTestId("line-0").boundingBox();
    const b = await owner.getByTestId("line-1").boundingBox();
    return Math.abs(a.x + a.width - (b.x + b.width));
  }).toBeLessThan(3);

  // F003: per-letter control.
  await openTab(owner, "Letter");
  await expect(owner.getByTestId("letter-hint")).toBeVisible();
  const neighbour = await letter(owner, "0:1").getAttribute("transform");
  await letter(owner, "0:0").click();
  await expect(letter(owner, "0:0")).toHaveAttribute("data-selected", "true");
  await expect(owner.getByTestId("selection-box")).toBeVisible();
  await owner.getByTestId("letter-rotation").fill("15");
  await expect(letter(owner, "0:0")).toHaveAttribute("transform", /rotate\(15[ ,)]/);
  await owner.getByTestId("letter-scale").fill("150");
  await expect(letter(owner, "0:0")).toHaveAttribute("transform", /scale\(1\.5\)/);
  await owner.getByTestId("letter-thickness").fill("6");
  await expect(letter(owner, "0:0")).toHaveAttribute("stroke-width", "6");
  const glyphs = Number(await letter(owner, "0:0").getAttribute("data-glyphs"));
  await owner.getByTestId("letter-elongation").fill("3");
  await expect(letter(owner, "0:0")).toHaveAttribute("data-glyphs", String(glyphs + 3));
  await owner.getByTestId("nudge-right").click();
  await owner.getByTestId("nudge-right").click();
  await expect(owner.getByTestId("letter-x")).toHaveValue("10");
  await expect(letter(owner, "0:0")).toHaveAttribute("transform", /translate\(10[ ,]0\)/);
  // Drag moves it too.
  const box = await letter(owner, "0:0").boundingBox();
  await owner.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await owner.mouse.down();
  await owner.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
  await owner.mouse.up();
  await expect(owner.getByTestId("letter-x")).not.toHaveValue("10");
  await owner.getByTestId("letter-x").fill("10");
  await owner.getByTestId("letter-y").fill("0");
  await owner.getByTestId("letter-color").fill("#b0413e");
  await expect(letter(owner, "0:0")).toHaveAttribute("fill", "#b0413e");
  expect(await letter(owner, "0:1").getAttribute("transform")).toBe(neighbour);
  await expect(letter(owner, "0:1")).toHaveAttribute("fill", "#1d4e89");
  // Undo and redo.
  await owner.getByTestId("undo").click();
  await expect(letter(owner, "0:0")).toHaveAttribute("fill", "#1d4e89");
  await owner.getByTestId("redo").click();
  await expect(letter(owner, "0:0")).toHaveAttribute("fill", "#b0413e");

  // F004: mirrored copy.
  await openTab(owner, "Mirror");
  await owner.getByTestId("mirror-add").click();
  await expect(owner.getByTestId("half-copy")).toHaveAttribute("transform", /scale\(-1,\s?1\)/);
  const copyBefore = await owner.getByTestId("half-copy").boundingBox();
  await owner.getByTestId("mirror-gap").fill("120");
  await expect.poll(async () => (await owner.getByTestId("half-copy").boundingBox()).x).not.toBe(copyBefore.x);
  await owner.getByTestId("mirror-axis-vertical").click();
  await expect(owner.getByTestId("half-copy")).toHaveAttribute("transform", /scale\(1,\s?-1\)/);
  await owner.getByTestId("mirror-axis-horizontal").click();
  await owner.getByTestId("mirror-gap").fill("40");
  await owner.getByTestId("half-select-copy").click();
  const groupBefore = await owner.getByTestId("half-copy").getAttribute("transform");
  await owner.getByTestId("half-nudge-up").click();
  await expect(owner.getByTestId("half-copy")).not.toHaveAttribute("transform", groupBefore);
  await expect(owner.getByTestId("half-original")).toBeVisible();
  await waitSaved(owner);
  const stored = await row(runtime, "select composition from projects where id = ?", id);
  expect(stored.composition).toContain("#b0413e");

  // F005: exports named after the project.
  const png = await exportAs(owner, "export-png");
  expect(png.name).toBe("Wedding Invitation.png");
  expect(png.bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(png.bytes.readUInt32BE(16)).toBe(2000);
  const clear = await exportAs(owner, "export-png-transparent");
  expect(clear.name.startsWith("Wedding Invitation")).toBe(true);
  expect(clear.name.endsWith(".png")).toBe(true);
  expect(clear.bytes.readUInt32BE(16)).toBe(2000);
  const svg = await exportAs(owner, "export-svg");
  expect(svg.name).toBe("Wedding Invitation.svg");
  const svgText = svg.bytes.toString();
  expect(svgText).toContain("<svg");
  expect(svgText).toContain("#b0413e");
  expect(svgText).toMatch(/scale\(-1,\s?1\)/);
  const outline = await exportAs(owner, "export-outline");
  expect(outline.name.startsWith("Wedding Invitation")).toBe(true);
  const outlineText = outline.bytes.toString();
  expect(outlineText).toContain('fill="none"');
  expect(outlineText).not.toContain("#b0413e");
  expect(outlineText).toMatch(/<path[^>]* d="M[^"]*Z"/);
  const pdf = await exportAs(owner, "export-pdf");
  expect(pdf.name).toBe("Wedding Invitation.pdf");
  const pdfText = pdf.bytes.toString("latin1");
  expect(pdfText.startsWith("%PDF")).toBe(true);
  expect(pdfText).not.toContain("/Image");
  expect(pdfText).toMatch(/ c\n/);

  // F001: rename, newest first, delete.
  await owner.getByTestId("project-menu").click();
  await owner.getByRole("menuitem", { name: "Rename" }).click();
  await owner.getByTestId("project-title-input").fill("Wedding Invitation Card");
  await owner.getByTestId("project-title-submit").click();
  await expect(owner.getByRole("heading", { level: 1, name: "Wedding Invitation Card" })).toBeVisible();
  const second = await createProject(owner, "Shop Sign");
  await owner.goto("/");
  await expect(owner.getByTestId("project-card").first()).toContainText("Shop Sign");
  await expect(owner.getByTestId("project-card").nth(1)).toContainText("Wedding Invitation Card");
  await expect(owner.getByTestId("project-card").nth(1).locator("img")).toBeVisible();
  await owner.goto(`/projects/${second}`);
  await waitForCanvas(owner);
  await owner.getByTestId("project-menu").click();
  await owner.getByRole("menuitem", { name: "Delete" }).click();
  await Promise.all([owner.waitForURL((u) => u.pathname === "/"), owner.getByTestId("confirm-delete").click()]);
  await expect(owner.getByTestId("project-card")).toHaveCount(1);

  // F006: share as viewer, then editor.
  await owner.goto(`/projects/${id}`);
  await waitForCanvas(owner);
  await owner.getByTestId("share-button").click();
  await owner.getByTestId("share-email").fill("member@example.test");
  await owner.getByTestId("share-submit").click();
  await expect(owner.getByTestId("share-row")).toContainText("member@example.test");
  await expect(owner.getByTestId("share-row")).toContainText("Viewer");
  await owner.keyboard.press("Escape");

  await member.goto("/");
  await expect(member.getByTestId("project-card")).toContainText("Wedding Invitation Card");
  await expect(member.getByTestId("project-role")).toHaveText("Viewer");
  await member.getByTestId("project-card").click();
  await waitForCanvas(member);
  await expect(member.getByTestId("view-only")).toBeVisible();
  await expect(member.getByTestId("text-input")).toHaveCount(0);
  const viewerExport = await exportAs(member, "export-svg");
  expect(viewerExport.name).toBe("Wedding Invitation Card.svg");

  await owner.getByTestId("share-button").click();
  await owner.getByTestId("share-email").fill("member@example.test");
  await owner.getByTestId("share-role-editor").click();
  await owner.getByTestId("share-submit").click();
  await expect(owner.getByTestId("share-row")).toContainText("Editor");
  await owner.keyboard.press("Escape");

  await member.reload();
  await waitForCanvas(member);
  await expect(member.getByTestId("view-only")).toHaveCount(0);
  await expect(member.getByTestId("share-button")).toHaveCount(0);
  await setText(member, "بسم الله\nالرحمن الرحيم\nمبارك");
  await waitSaved(member);
  await owner.reload();
  await waitForCanvas(owner);
  await expect(owner.getByTestId("text-input")).toHaveValue("بسم الله\nالرحمن الرحيم\nمبارك");

  // Templates: publish, copy, unpublish.
  await owner.getByTestId("publish-button").click();
  await expect(owner.getByTestId("unpublish-button")).toBeVisible();
  await member.goto("/templates");
  await expect(member.getByTestId("template-card")).toContainText("Wedding Invitation Card");
  await expect(member.getByTestId("template-card").locator("img")).toBeVisible();
  await expect(member.getByTestId("template-unpublish")).toHaveCount(0);
  await Promise.all([
    member.waitForURL((u) => /\/projects\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(id)),
    member.getByTestId("template-use").click(),
  ]);
  await waitForCanvas(member);
  const copyId = member.url().split("/").pop();
  await expect(member.getByTestId("view-only")).toHaveCount(0);
  await expect(member.getByTestId("share-button")).toBeVisible();
  await setText(member, "مبارك");
  await waitSaved(member);
  const original = await row(runtime, "select composition from projects where id = ?", id);
  expect(original.composition).toContain("الرحيم");
  const copied = await row(runtime, "select owner_id, composition from projects where id = ?", copyId);
  expect(copied.owner_id).toBe("member");
  expect(copied.composition).not.toContain("الرحيم");

  // Removing the share takes the project off the member's list.
  await owner.getByTestId("share-button").click();
  await owner.getByTestId("share-remove").click();
  await expect(owner.getByTestId("share-row")).toHaveCount(0);
  await owner.keyboard.press("Escape");
  await member.goto("/");
  await expect(member.getByTestId("project-card")).toHaveCount(1);
  await expect(member.getByTestId("project-role")).toHaveCount(0);

  await owner.goto("/templates");
  await owner.getByTestId("template-unpublish").click();
  await expect(owner.getByTestId("templates-empty")).toBeVisible();

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(phone.getByTestId("new-project").first()).toBeVisible();
  await phone.goto(`/projects/${copyId}`);
  await waitForCanvas(phone);
  await expect(phone.getByTestId("text-input")).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // The finished piece, for the app's picture.
  await owner.goto(`/projects/${id}`);
  await waitForCanvas(owner);
  await expect(owner.getByTestId("half-copy")).toBeVisible();
  await setText(owner, "بسم الله");
  await owner.getByTestId("size-input").fill("150");
  await owner.getByTestId("style-ruqah").click();
  await waitForCanvas(owner);
  await expect(owner.getByTestId("canvas")).toHaveAttribute("data-style", "ruqah");
  await waitSaved(owner);
  await runtime.screenshot(owner);
} finally {
  await runtime.close();
}
