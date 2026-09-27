# User Guide

Kanban Studio is a single-board Kanban app with an AI assistant that can answer questions about your board and make changes for you.

## Before you start

You need:

- Docker Desktop (or Docker Engine with Compose), running.
- A `.env` file in the project root containing `OPENROUTER_API_KEY=<your key>`. The board works without it, but the AI assistant will not be able to respond.

## Starting and stopping the app

From the project root, run the start script for your operating system:

- macOS or Linux: `scripts/start.sh`
- Windows PowerShell: `scripts/start.ps1`
- Windows Command Prompt: `scripts/start.bat`

The script builds the app and starts it. The first start takes a few minutes while Docker builds the image; later starts are faster. Once it's running, open `http://localhost:8000` in your browser.

To stop the app, run the matching stop script (`scripts/stop.sh`, `scripts/stop.ps1`, or `scripts/stop.bat`).

## Signing in

Use the demo account to sign in:

- Username: `user`
- Password: `password`

Any other combination shows "Invalid username or password".

Click **Log out** at the top right to return to the sign-in page. Reloading the page also signs you out, but your board is kept: sign in again and it is exactly as you left it.

## The board

Your board starts with five columns: Backlog, Discovery, In Progress, Review, and Done. Each column shows how many cards it holds.

- **Rename a column**: click a column's title and type a new name. The change is saved as you type.
- **Add a card**: click **Add a card** at the bottom of a column, enter a title (required) and details (optional), then click **Add card**. Click **Cancel** to close the form without adding anything.
- **Remove a card**: click **Remove** on a card. There is no confirmation and no undo, so remove carefully.
- **Move a card**: drag a card and drop it in another column, or drop it on another card to reorder it within a column. An empty column shows "Drop a card here" as a drop target.
- **Edit a card**: the board has no edit form for existing cards. To change a card's title or details, ask the assistant (see below), or remove the card and add it again.

Every change is saved automatically. There's no save button, and your board stays as you left it after you sign out, reload, or stop and restart the app.

To start over with the default board, stop the app and delete `backend/data/pm_mvp.db`. It is recreated with the default board the next time the app starts.

## The AI assistant

The **Board Assistant** panel sits to the right of the board (below it in a narrow window). Type a message and click **Send**, or press Enter. While the assistant is working you'll see "Thinking...", and both the message box and the board are locked (the board dims) until it replies, so a change you make can't be overwritten by the assistant's answer.

You can ask it questions, for example:

- "How many cards are in the Backlog column?"
- "What's the status of the roadmap card?"

You can also ask it to make changes, for example:

- "Add a card to Review titled 'QA the new signup flow'."
- "Move the card about customer signals to In Progress."
- "Change the details of the roadmap card to 'Draft Q3 themes by Friday'."
- "Remove the card about the pricing page."
- "Rename the Discovery column to Research."

When the assistant makes a change, the board updates immediately and the change is saved. You don't need to refresh the page. If a request doesn't need a board change, the assistant just answers and leaves your board as it is.

The assistant sees only your current board and your conversation with it. The conversation itself is not saved: signing out or reloading the page clears it, and the assistant starts fresh (your board is unaffected).

## If something goes wrong

- **"Could not load your board."** The app couldn't reach the server. Make sure the app is running, then click **Retry**.
- **"Could not save your changes. Try again."** Your last change is shown on screen but was not saved. Make sure the app is running and make the change again. Reloading the page shows the last version that was saved.
- **"Could not reach the assistant. Try again."** The AI request failed. Check that `OPENROUTER_API_KEY` is set in `.env` (restart the app after changing it), then send your message again. Your board and the conversation so far are not affected.

## Tips

- Be specific about which card or column you mean, especially if you have cards with similar names.
- Replies can take a while. The assistant runs on a free AI model that is sometimes slow.
- Check the board after asking for a change. If the assistant changed something you didn't ask for, fix it by moving, removing, or re-adding the card yourself, or ask the assistant to undo it.
