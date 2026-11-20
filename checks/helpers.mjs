import { readFile } from "node:fs/promises";
import { expect } from "/home/user/oss-new/control/runtime/index.mjs";

/** Creates a project from the list page and waits for its editor. Returns its id. */
export async function createProject(page, title) {
  await page.goto("/");
  await page.getByTestId("new-project").first().click();
  await page.getByTestId("project-title-input").fill(title);
  await Promise.all([
    page.waitForURL(/\/projects\/[0-9a-f-]{36}$/),
    page.getByTestId("project-title-submit").click(),
  ]);
  await waitForCanvas(page);
  return page.url().split("/").pop();
}

export async function waitForCanvas(page) {
  await expect(page.getByTestId("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
}

/** Waits until every edit made so far is stored on the server. */
export async function waitSaved(page) {
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-dirty", "false", { timeout: 15000 });
}

export async function setText(page, text) {
  await page.getByTestId("text-input").fill(text);
  await waitForCanvas(page);
}

export function letter(page, key) {
  return page.locator(`[data-testid="letter"][data-key="${key}"]`);
}

export async function openTab(page, name) {
  await page.getByRole("tab", { name }).click();
}

/** Clicks an export item and returns { name, bytes } of the download. */
export async function exportAs(page, testId) {
  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(testId).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: await readFile(path) };
}

/** Runs `action` and returns the first server-function POST it sends. */
export async function captureServerCall(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/_serverFn/")),
    action(),
  ]);
  const url = new URL(request.url());
  const headers = { ...(await request.allHeaders()) };
  for (const name of Object.keys(headers)) {
    if (name.startsWith(":") || ["cookie", "host", "content-length", "origin", "referer"].includes(name)) delete headers[name];
  }
  return { path: url.pathname + url.search, headers, body: request.postData() };
}

export function replay(runtime, call, role) {
  return runtime.fetch(call.path, { role, method: "POST", headers: call.headers, body: call.body });
}

export async function row(runtime, sql, ...params) {
  const db = await runtime.database();
  return db.prepare(sql).bind(...params).first();
}
