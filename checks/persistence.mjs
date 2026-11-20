// Persistence: a project's composition survives a restart.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, waitForCanvas, waitSaved, setText, letter, openTab } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  let page = await (await runtime.context("owner")).newPage();
  const id = await createProject(page, "Shop Sign");
  await setText(page, "مكتبة النور");
  await page.getByTestId("style-ruqah").click();
  await waitForCanvas(page);
  await openTab(page, "Letter");
  await letter(page, "0:0").click();
  await page.getByTestId("letter-rotation").fill("12");
  await page.getByTestId("letter-color").fill("#7a3e9d");
  await openTab(page, "Mirror");
  await page.getByTestId("mirror-add").click();
  await page.getByTestId("mirror-axis-vertical").click();
  await waitSaved(page);

  await runtime.restart();
  page = await (await runtime.context("owner")).newPage();
  await page.goto("/");
  await expect(page.getByTestId("project-card")).toContainText("Shop Sign");
  await expect(page.getByTestId("project-card").locator("img")).toBeVisible();
  await page.goto(`/projects/${id}`);
  await waitForCanvas(page);
  await expect(page.getByTestId("text-input")).toHaveValue("مكتبة النور");
  await expect(page.getByTestId("canvas")).toHaveAttribute("data-style", "ruqah");
  await expect(letter(page, "0:0").first()).toHaveAttribute("transform", /rotate\(12[ ,)]/);
  await expect(letter(page, "0:0").first()).toHaveAttribute("fill", "#7a3e9d");
  await expect(page.getByTestId("half-copy")).toHaveAttribute("transform", /scale\(1,\s?-1\)/);
} finally {
  await runtime.close();
}
