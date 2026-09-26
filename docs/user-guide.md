# User Guide

Kanban Studio is a single-board Kanban app with an AI assistant that can answer questions about your board and make changes for you.

## Starting the app

The app runs locally in Docker. From the project root, run the start script for your operating system:

- macOS or Linux: `scripts/start.sh`
- Windows PowerShell: `scripts/start.ps1`
- Windows Command Prompt: `scripts/start.bat`

Once it's running, open `http://localhost:8000` in your browser.

To stop the app, run the matching stop script (`scripts/stop.sh`, `scripts/stop.ps1`, or `scripts/stop.bat`).

## Signing in

Use the demo account to sign in:

- Username: `user`
- Password: `password`

Click **Log out** at the top of the screen to return to the sign-in page.

## The board

Your board has five columns: Backlog, Discovery, In Progress, Review, and Done.

- **Rename a column**: click into a column's title and type a new name.
- **Add a card**: click **Add a card** at the bottom of a column, fill in a title (required) and details (optional), then click **Add card**.
- **Remove a card**: click **Remove** on a card.
- **Move a card**: drag a card and drop it in another column, or drop it on another card to reorder it within a column.

Every change is saved automatically — there's no separate save button, and your board is exactly as you left it the next time you sign in, even after stopping and restarting the app. To start over with the default board, stop the app and delete `backend/data/pm_mvp.db`.

## The AI assistant

The panel on the right is your board assistant. Type a message and click **Send** (or press Enter).

You can ask it questions, for example:

- "How many cards are in the Backlog column?"
- "What's the status of the roadmap card?"

You can also ask it to make changes, for example:

- "Add a card to Review titled 'QA the new signup flow'."
- "Move the card about customer signals to In Progress."
- "Rename the Discovery column to Research."

When the assistant makes a change, the board updates automatically — you don't need to refresh the page. If a request doesn't require a board change, the assistant will just reply with an answer and leave your board as-is.

The assistant only sees your current board and your conversation with it; it can't see or affect anything outside your board.

## Tips

- Be specific about which card or column you mean, especially if you have similarly named cards.
- If the assistant's reply seems slow, that's expected — it's a free AI model and can occasionally take a little while to respond.
- If something looks wrong after an AI request, you can always undo it manually by editing, moving, or deleting the card yourself.
