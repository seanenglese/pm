import { expect, test, type Page } from "@playwright/test";

// These run against the real app (FastAPI + SQLite + static build; see global-setup.ts).
// Each test registers its own account so tests never share board state.

const PASSWORD = "e2e-password";

const uniqueUsername = () =>
  `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const signIn = async (page: Page, username: string, password: string) => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
};

const registerNewUser = async (page: Page) => {
  const username = uniqueUsername();
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
  return username;
};

const columns = (page: Page) => page.locator('[data-testid^="column-"]');

test("the demo account signs in to its board", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "user", "password");

  await expect(page.getByRole("navigation", { name: "Boards" })).toBeVisible();
  await expect(columns(page).first()).toBeVisible();
});

test("wrong credentials are rejected", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "user", "not-the-password");

  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("a new account gets a starter board and stays signed in across reloads", async ({
  page,
}) => {
  const username = await registerNewUser(page);

  await expect(page.getByText(`Signed in as ${username}`)).toBeVisible();
  await expect(columns(page)).toHaveCount(5);

  await page.reload();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
});

test("registering a taken username explains the problem", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  await expect(page.getByText("That username is already taken")).toBeVisible();
});

test("logging out ends the session", async ({ page }) => {
  const username = await registerNewUser(page);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await signIn(page, username, PASSWORD);
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
});

test("an added card is saved to the database", async ({ page }) => {
  await registerNewUser(page);
  const firstColumn = columns(page).first();

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();

  await page.reload();
  await expect(columns(page).first().getByText("Playwright card")).toBeVisible();
});

test("editing a card's priority, due date, and labels is saved", async ({ page }) => {
  await registerNewUser(page);
  const card = page.getByTestId("card-card-2");
  await expect(card.getByText("research")).toBeVisible();

  await card.getByRole("button", { name: "Edit Gather customer signals" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit card" });
  await dialog.getByLabel("Title").fill("Interview five customers");
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByLabel("Due date").fill("2020-01-31");
  await dialog.getByLabel("Labels").fill("research, interviews");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  const saved = page.getByTestId("card-card-2");
  await expect(saved.getByText("Interview five customers")).toBeVisible();
  await expect(saved.getByText("high")).toBeVisible();
  await expect(saved.getByTestId("due-date")).toHaveText("Overdue Jan 31, 2020");
  await expect(saved.getByText("interviews")).toBeVisible();
});

test("columns can be added, renamed, reordered, and deleted", async ({ page }) => {
  await registerNewUser(page);
  const titles = () => page.getByLabel("Column title");

  await page.getByRole("button", { name: "Add column" }).click();
  await expect(titles()).toHaveCount(6);
  await titles().last().fill("Blocked");
  await page.getByRole("button", { name: "Move Blocked left" }).click();
  await expect(titles().nth(4)).toHaveValue("Blocked");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete column Discovery" }).click();
  await expect(titles()).toHaveCount(5);

  await page.reload();
  await expect(titles()).toHaveCount(5);
  await expect(titles().nth(3)).toHaveValue("Blocked");
  await expect(page.getByText("Prototype analytics view")).toHaveCount(0);
});

test("hiding the assistant makes room for more columns", async ({ page }) => {
  await registerNewUser(page);
  // Columns sit in a horizontal scroll area; a column is fully shown when it ends
  // inside that area. (Viewport checks don't work: columns are taller than the window.)
  const reviewFitsOnScreen = () =>
    page.getByTestId("column-col-review").evaluate((column) => {
      const area = column.parentElement!.getBoundingClientRect();
      return column.getBoundingClientRect().right <= area.right;
    });
  expect(await reviewFitsOnScreen()).toBe(false);

  await page.getByRole("button", { name: "Hide assistant" }).click();

  await expect(page.getByLabel("Chat message")).toHaveCount(0);
  await expect.poll(reviewFitsOnScreen).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show assistant" })).toBeVisible();
});

test("a dragged card stays in its new column after a reload", async ({ page }) => {
  await registerNewUser(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-1")).toBeVisible();
});

test("boards can be created, switched, renamed, and deleted", async ({ page }) => {
  await registerNewUser(page);
  const nav = page.getByRole("navigation", { name: "Boards" });

  await nav.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("New board name").fill("Launch");
  await nav.getByRole("button", { name: "Create" }).click();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("Launch");
  await expect(columns(page)).toHaveCount(4);

  await nav.getByRole("button", { name: "My first board" }).click();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
  await expect(columns(page)).toHaveCount(5);

  await nav.getByRole("button", { name: "Launch" }).click();
  await page.getByLabel("Board name", { exact: true }).fill("Launch v2");
  await page.getByLabel("Board name", { exact: true }).press("Enter");
  await expect(nav.getByRole("button", { name: "Launch v2" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("Launch v2");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(nav.getByRole("button", { name: "Launch v2" })).toHaveCount(0);
  await expect(page.getByLabel("Board name", { exact: true })).toHaveValue("My first board");
});

test("one user's boards are invisible to another", async ({ browser }) => {
  const alice = await browser.newPage();
  await registerNewUser(alice);
  const nav = alice.getByRole("navigation", { name: "Boards" });
  await nav.getByRole("button", { name: "New board" }).click();
  await alice.getByLabel("New board name").fill("Alice private");
  await nav.getByRole("button", { name: "Create" }).click();
  await expect(alice.getByLabel("Board name", { exact: true })).toHaveValue("Alice private");

  const bob = await browser.newPage();
  await registerNewUser(bob);
  await expect(bob.getByRole("button", { name: "Alice private" })).toHaveCount(0);
  await expect(
    bob.getByRole("navigation", { name: "Boards" }).getByRole("button", { name: "My first board" })
  ).toBeVisible();
});

test("the chat sidebar reports a failed assistant call from the real backend", async ({
  page,
}) => {
  await registerNewUser(page);

  await page.getByLabel("Chat message").fill("Hello?");
  await page.getByRole("button", { name: "Send" }).click();

  // The e2e container has no OPENROUTER_API_KEY, so the backend answers 502.
  await expect(page.getByText(/could not reach the assistant/i)).toBeVisible();
  await expect(page.getByText("Hello?")).toBeVisible();
});

test("the assistant's board update is applied without a refresh", async ({ page }) => {
  await registerNewUser(page);
  // Stand in for the model: the rest of the flow (auth, board load) is real.
  await page.route("**/api/boards/*/chat", async (route) => {
    const boardUrl = route.request().url().replace(/\/chat$/, "");
    const current = await (
      await route.fetch({ url: boardUrl, method: "GET" })
    ).json();
    const board = current.board;
    board.columns[0].title = "Renamed by AI";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "Renamed the first column.", board }),
    });
  });

  await page.getByLabel("Chat message").fill("Please rename the first column");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Renamed the first column.")).toBeVisible();
  await expect(columns(page).first().getByLabel("Column title")).toHaveValue("Renamed by AI");
});
