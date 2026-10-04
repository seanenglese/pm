# User Guide

Kanban Studio is a Kanban app for your projects. Each account can have as many boards as it needs, and an AI assistant can answer questions about a board and make changes for you.

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

## Your account

To create an account, click **Create an account** on the sign-in page and choose:

- a username of 3 to 32 characters: letters, numbers, dots, dashes or underscores
- a password of at least 8 characters

You're signed in straight away, with a starter board called "My first board" holding some example cards.

There is also a demo account you can use without signing up: username `user`, password `password`.

A wrong username or password shows "Invalid username or password". Your boards are private: other accounts can't see or change them.

You stay signed in when you reload the page or come back later, for up to 30 days. Click **Log out** at the top right to sign out on this browser.

Click **Account** at the top right to manage your account:

- **Change password**: enter your current password and the new one twice (at least 8 characters), then click **Change password**. This browser stays signed in; any other browser or device signed in to your account is signed out.
- **Delete account**: enter your password, click **Delete my account**, and confirm. Your account and all of its boards are deleted for good, and you return to the sign-in page. The username can then be registered again.

## Boards

Your boards are listed as tabs across the top of the page. The board you had open last opens again next time.

- **Open a board**: click its tab.
- **Create a board**: click **New board**, type a name, and click **Create**. A new board starts with four empty columns: To Do, In Progress, Review, and Done.
- **Rename a board**: click the board's name above its columns, type a new one, and press Enter (or click elsewhere).
- **Delete a board**: click **Delete board** and confirm. The board and all of its cards are deleted for good.

If you delete your last board, the page shows "No boards yet" until you create another.

## Working on a board

The line under the board name shows how many columns and cards it has. Each column shows how many cards it holds. If a board has more columns than fit on screen, scroll the columns sideways.

- **Rename a column**: click a column's title and type a new name. The change is saved as you type.
- **Add a column**: click **Add column** after the last column. It's called "New column" until you rename it.
- **Reorder columns**: use the arrow buttons at the top of a column to move it left or right.
- **Delete a column**: click **Delete** at the top of the column. If it has cards you'll be asked to confirm, and its cards are deleted with it.
- **Add a card**: click **Add a card** at the bottom of a column, enter a title (required) and details (optional), then click **Add card**. Click **Cancel** to close the form without adding anything.
- **Remove a card**: click **Remove** on a card. There is no confirmation and no undo, so remove carefully.
- **Move a card**: drag a card and drop it in another column, or drop it on another card to reorder it within a column. An empty column shows "Drop a card here" as a drop target.
- **Edit a card**: click **Edit** on a card. You can change its title and details, set a priority (High, Medium, Low, or None), pick a due date, and add labels separated by commas (for example `design, frontend`; up to 10). Click **Save** to keep your changes, or **Cancel** (or press Escape) to close without saving.

A card shows its priority, due date, and labels under its details. The due date turns red with "Overdue" once it has passed, and yellow on the day it's due.

Every change is saved automatically. There's no save button, and your board stays as you left it after you sign out, reload, or stop and restart the app.

To start over completely, stop the app and delete `backend/data/pm_mvp.db`. This deletes every account and board; the database is recreated, with just the demo account, the next time the app starts.

## Finding cards

The bar above the columns narrows the board down to the cards you care about:

- **Search cards**: type any word from a card's title, details, or labels.
- **Priority**: show only High, Medium, or Low cards, or cards with no priority.
- **Label**: show only cards with a particular label.
- **Due date**: show cards that are overdue, due today, due in the next 7 days, or have no due date.

Filters can be combined. While any filter is on, the bar shows how many cards match ("Showing 3 of 8 cards"), each column shows how many of its cards match, and **Clear filters** turns them all off. Filtering only changes what you see: hidden cards are not removed, and you can still edit, move, and delete the cards that are shown. Filters reset when you switch boards or reload the page.

## The AI assistant

The **Board Assistant** panel sits to the right of the board (below it in a narrow window). To make room for more columns, click **Hide assistant** above the board; click **Show assistant** to bring it back. Your conversation is kept while it is hidden, and the app remembers your choice. Type a message and click **Send**, or press Enter. While the assistant is working you'll see "Thinking...", and both the message box and the board are locked (the board dims) until it replies, so a change you make can't be overwritten by the assistant's answer.

You can ask it questions, for example:

- "How many cards are in the Backlog column?"
- "What's the status of the roadmap card?"

You can also ask it to make changes, for example:

- "Add a card to Review titled 'QA the new signup flow'."
- "Move the card about customer signals to In Progress."
- "Change the details of the roadmap card to 'Draft Q3 themes by Friday'."
- "Remove the card about the pricing page."
- "Rename the Discovery column to Research."
- "Make the roadmap card high priority and due next Friday."
- "Label every card in Review with 'qa'."
- "Which cards are overdue?"

When the assistant makes a change, the board updates immediately and the change is saved. You don't need to refresh the page. If a request doesn't need a board change, the assistant just answers and leaves your board as it is.

The assistant sees only the board you have open and your conversation with it, and it only changes that board. The conversation itself is not saved: switching boards, signing out, or reloading the page clears it, and the assistant starts fresh (your boards are unaffected).

## If something goes wrong

- **"Could not load your boards."** or **"Could not load your board."** The app couldn't reach the server. Make sure the app is running, then click **Retry**.
- **You're back at the sign-in page unexpectedly.** Your session ended (after 30 days, or because your password was changed elsewhere). Sign in again; your boards are unaffected.
- **"Could not create the board"**, **"rename"** or **"delete"**. The server didn't accept the change. Make sure the app is running and try again.
- **"Could not save your changes. Try again."** Your last change is shown on screen but was not saved. Make sure the app is running and make the change again. Reloading the page shows the last version that was saved.
- **"Could not reach the assistant. Try again."** The AI request failed. Check that `OPENROUTER_API_KEY` is set in `.env` (restart the app after changing it), then send your message again. Your board and the conversation so far are not affected.

## Tips

- Be specific about which card or column you mean, especially if you have cards with similar names.
- Replies can take a while. The assistant runs on a free AI model that is sometimes slow.
- Check the board after asking for a change. If the assistant changed something you didn't ask for, fix it by moving, removing, or re-adding the card yourself, or ask the assistant to undo it.
