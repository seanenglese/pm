import { expect, test, type Page } from "@playwright/test";

const BOARD_ROUTE = "**/api/users/*/board";
const CHAT_ROUTE = "**/api/users/*/chat";

type ChatHandler = (
  message: string,
  board: Record<string, unknown>
) => { reply: string; board?: Record<string, unknown> };

/** Fakes the backend board and chat contracts so e2e runs without a live FastAPI server. */
const mockBoardApi = async (page: Page, chatHandler?: ChatHandler) => {
  const initialBoard = {
    columns: [
      { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
      { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
      { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
      { id: "col-review", title: "Review", cardIds: ["card-6"] },
      { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
    ],
    cards: Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const id = `card-${index + 1}`;
        return [id, { id, title: `Card ${index + 1}`, details: "Seeded card." }];
      })
    ),
  };

  let storedBoard: Record<string, unknown> = initialBoard;

  await page.route(BOARD_ROUTE, async (route) => {
    if (route.request().method() === "PUT") {
      storedBoard = route.request().postDataJSON();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ username: "user", board: storedBoard }),
    });
  });

  await page.route(CHAT_ROUTE, async (route) => {
    const { message } = route.request().postDataJSON();
    const result = chatHandler
      ? chatHandler(message, storedBoard)
      : { reply: `Echo: ${message}` };
    if (result.board) {
      storedBoard = result.board;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: result.reply, board: storedBoard }),
    });
  });
};

const login = async (page: Page) => {
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
};

test("loads the kanban board", async ({ page }) => {
  await mockBoardApi(page);
  await page.goto("/");
  await login(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await mockBoardApi(page);
  await page.goto("/");
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await mockBoardApi(page);
  await page.goto("/");
  await login(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("persists a rename across a page reload", async ({ page }) => {
  await mockBoardApi(page);
  await page.goto("/");
  await login(page);

  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const titleInput = firstColumn.getByLabel("Column title");
  await titleInput.fill("Renamed via e2e");
  await titleInput.blur();

  await page.reload();
  await login(page);

  await expect(
    page.locator('[data-testid^="column-"]').first().getByLabel("Column title")
  ).toHaveValue("Renamed via e2e");
});

test("sends a chat message and applies the assistant's board update automatically", async ({
  page,
}) => {
  await mockBoardApi(page, (message, board) => {
    if (/rename/i.test(message)) {
      const columns = board.columns as Array<{ id: string; title: string; cardIds: string[] }>;
      return {
        reply: "Renamed the first column.",
        board: {
          ...board,
          columns: columns.map((column, index) =>
            index === 0 ? { ...column, title: "Renamed by AI" } : column
          ),
        },
      };
    }
    return { reply: `You said: ${message}` };
  });
  await page.goto("/");
  await login(page);

  await page.getByLabel("Chat message").fill("Please rename the first column");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("Renamed the first column.")).toBeVisible();
  await expect(
    page.locator('[data-testid^="column-"]').first().getByLabel("Column title")
  ).toHaveValue("Renamed by AI");
});
