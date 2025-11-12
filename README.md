# 🧹 Chores

A simple, clean web application for tracking household chores, powered by your personal Notion workspace.

This app fetches chore definitions from a Notion database, intelligently calculates which chores are due, and allows you
to mark them as complete.
Completed chores are logged in a separate "Chore Log" database.

This uses netlify functions as a backend to communicate with Notion.

## 🚀 Developer Guidelines

This guide will help you get a local copy up and running and explain the project structure.

### 🛠️ Tech Stack

* **Framework:** React (Vite)
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **Icons:** Lucide React

---

### 1. Notion Setup (Required)

This app **will not run** without a properly configured Notion backend.

#### A. Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Click **"New integration"**. Give it a name (e.g., "Chore App").
3. For capabilities, ensure it has **"Read content," "Update content,"** and **"Insert content"** permissions.
4. Submit and copy the **"Internal Integration Token."** This is your API key.

#### B. Create the Databases

You need to create two databases in your Notion workspace.

**Database 1: Chores (Your Main List)**

1. Create a new **inline or full-page database**.
2. Get its ID. The URL will be `notion.so/your-workspace/DATABASE_ID?v=...`. Copy the `DATABASE_ID`.
3. Set up the following properties (case-sensitive):
    * **`Name`** (Type: `Title`): The name of the chore (e.g., "Wash dishes").
    * **`Assigned to`** (Type: `Person`): The person/people responsible.
    * **`Days`** (Type: `Number`): How often the chore should be done (in days). (e.g., `1` for daily, `7` for weekly).
    * **`Room`** (Type: `Select`): The room the chore is in (e.g., "Kitchen", "Bathroom").
    * **`Log`** (Type: `Relation`): A relation to the "Chore Log" database you'll create in the next step. (Hide this
      property).
    * **`Last completed at`** (Type: `Rollup`):
        * **Relation:** Select `Log`
        * **Property:** Select `Date`
        * **Calculate:** Select `Latest date`

**Database 2: Chore Log (Your History)**

1. Create another new database.
2. Get its ID from the URL.
3. Set up the following properties:
    * *(empty string)* (Type: `Title`): We don't need anything here, but a data source item needs a `Title`.
    * **`Date`** (Type: `Date`): The date the chore was completed.
    * **`Completed by`** (Type: `Person`): The person who completed the chore.
    * **`Chore Relation`** (Type: `Relation`): The other side of the relation pointing back to your "Chores" database.

#### C. Share Databases with Integration

1. Go to both the "Chores" database and the "Chore Log" database.
2. Click the **Share** button in the top-right corner.
3. Click **Invite** and select your "Chore App" integration.
4. Give it **"Can edit"** permissions.

---

### 2. Local Project Setup

Once your Notion backend is ready, you can run the app.

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/olliechick/chores.git](https://github.com/olliechick/chores.git)
   cd chores
   ```

2. **Install dependencies:**
   ```bash
   npm i
   ```

3. **Set Environment Variables:**
   This project uses Netlify Functions for its backend, which require server-side environment variables. Create a file
   named `.env` in the root of the project:

   ```text
   # Your Notion Integration Token (from Step 1A)
   NOTION_API_TOKEN=secret_...

   # Your "Chores" Database ID (from Step 1B)
   CHORE_DB_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

   # Your "Chore Log" Database ID (from Step 1B)
   CHORE_LOG_DB_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   These variables will be read by the Netlify CLI.

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   This command is configured to use `netlify dev`, which will start both your React frontend (on Vite) and your backend
   Netlify Functions. The Netlify CLI will automatically open your browser to the correct local address.

---

### Coding Style

* Use kebab case for file names
* For components, use one file per component, which live inside `src/components/`
* Props Typing: Do not use `React.FC`. Define props using a dedicated `type` or `interface` (preferred).

    ```typescript
    // Good: Using a separate type (Preferred for reusability/clarity)
    type UserProfileProps = {
      user: User;
    }
    
    export const UserProfile = ({ user }: UserProfileProps) => {
      // ...
    }
    
    // Bad: Avoid React.FC
    import React from 'react';
    
    const UserProfile: React.FC<UserProfileProps> = ({ user }) => {
      // ...
    }
    ```