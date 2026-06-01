# ADHDeeds Deployment Setup

## 1. Supabase

1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Paste and run the contents of `supabase-schema.sql`.
4. Go to `Authentication` > `Providers` > `Email`.
5. Enable Email signups.
6. For the easiest first deploy, disable email confirmations while testing. You can turn them back on later.
7. Go to `Project Settings` > `API`.
8. Copy:
   - `Project URL`
   - `anon public` key

Important: use the anon public key only. Do not put the Supabase service role key into Vercel or the browser app.

## 1A. Google Login

Set up Google OAuth after you know your local and production URLs.

### Google Cloud

1. Go to Google Cloud Console.
2. Create or select a project.
3. Go to `APIs & Services` > `OAuth consent screen`.
4. Choose `External` unless this is only for a Google Workspace organisation.
5. Fill in the app name: `ADHDeeds`.
6. Add your email as the support/developer contact.
7. Go to `APIs & Services` > `Credentials`.
8. Create `OAuth client ID`.
9. Application type: `Web application`.
10. Add Authorised JavaScript origins:
    - `http://127.0.0.1:5173`
    - your Vercel URL, for example `https://adhdeeds.vercel.app`
11. Add Authorised redirect URIs:
    - `https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback`
12. Copy the Google `Client ID` and `Client Secret`.

### Supabase

1. Go to Supabase `Authentication` > `Providers`.
2. Open `Google`.
3. Enable Google.
4. Paste the Google `Client ID`.
5. Paste the Google `Client Secret`.
6. Save.

The app uses Supabase as the OAuth callback handler, then Supabase redirects users back to ADHDeeds.

## 2. Local Environment

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

Then run:

```bash
npm install
npm run dev
```

Local URL:

```text
http://127.0.0.1:5173/
```

## 3. GitHub

```bash
git init
git add .
git commit -m "Create ADHDeeds synced app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

If GitHub asks for a password in Terminal, use a GitHub personal access token instead of your GitHub password.

## 4. Vercel

1. Go to Vercel.
2. Choose `Add New` > `Project`.
3. Import your GitHub repository.
4. Framework preset should be `Vite`.
5. Build command: `npm run build`.
6. Output directory: `dist`.
7. Add Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
8. Deploy.

You do not need to add any Supabase secret/service key. This app uses Supabase Auth and Row Level Security from the browser.

`OPENAI_API_KEY` is private and must not start with `VITE_`. Vercel keeps it on the serverless API route, so it is not exposed in the browser. `OPENAI_MODEL` is optional; if you do not add it, the app uses `gpt-4o-mini`.

## 4A. AI Features

The app uses AI for:

- Better kind reframes from task actions.
- Improved daily plans from the Today view.
- Short opinions from Worth Doing Next cards.

If the OpenAI key is missing or the AI request fails, ADHDeeds keeps working and falls back to the built-in local suggestions.

AI usage is billed to the OpenAI account behind `OPENAI_API_KEY`, even when friends or testers use the app. The `/api/ai` route checks the user's Supabase login token before making an OpenAI request, so anonymous visitors cannot call it directly. For wider testing, set a sensible usage limit in your OpenAI account dashboard.

## 5. Supabase Auth URLs

After Vercel gives you a production URL:

1. Go to Supabase `Authentication` > `URL Configuration`.
2. Set `Site URL` to your Vercel URL.
3. Add Redirect URLs:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `http://localhost:5173/`
   - `http://127.0.0.1:5173/`
   - your Vercel URL
   - your Vercel URL with a trailing slash

If you keep email confirmations enabled, Supabase will use these URLs when users follow confirmation links.

## How Sync Works

ADHDeeds stores all tasks and habits in one protected Supabase row per signed-in user. Row Level Security means each user can only read and write their own row. Local browser data is migrated into Supabase the first time a user signs in if no cloud data exists yet.

## Smoke Test

1. Open the Vercel URL.
2. Create an account.
3. Add a task.
4. Refresh the page.
5. Sign out and sign back in.
6. The task should still be there.

Then open the same Vercel URL on another device and sign in with the same account. The same task data should load.
