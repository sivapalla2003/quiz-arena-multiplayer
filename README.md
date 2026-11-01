# Quiz Arena

A responsive multiplayer quiz game built with React, TypeScript, Vite, and Supabase. Rooms are server-authoritative: the Edge Function and PostgreSQL own room membership, question timing, answer validation, and scores.

## What is included

- Private six-character rooms for 2–8 players, nickname-only entry, host controls, avatars, and reconnects using a per-browser session token.
- Ten-question matches, a shared 15-second server deadline, one answer per player per round, speed bonuses, interim standings, final results, and rematches.
- Ten quiz categories and a seeded question bank (10 questions per category). Correct choices are shuffled when questions are inserted.
- Server-only answer keys and score writes. Browser clients cannot query the database tables directly.
- Supabase Realtime broadcasts with short-interval state refresh as a fallback.

The starter question bank contains 10 questions per category with mixed difficulty. The selected difficulty is saved with the room and questions tagged for that level are prioritized first; the remaining questions are drawn from the same category so every match can contain 10 distinct questions. Add a larger level-specific bank if each match must use only questions of the selected difficulty.

## Run locally

1. Create a Supabase project and copy its project URL and anon (publishable) key into `.env` using `.env.example` as a template. These two values are intended for browser use; never put the service role key in a `VITE_` variable.
2. In the Supabase SQL Editor, run `supabase/migrations/202611010001_initial.sql`, then run `supabase/seed.sql`.
3. Install the Supabase CLI and sign in. Link this folder to the project with `supabase link --project-ref YOUR_PROJECT_REF`.
4. Deploy the server function: `supabase functions deploy game`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime. The service role key must remain server-side.
5. Install dependencies and start the frontend:

   ```sh
   npm install
   npm run dev
   ```

6. Open the Vite URL in two separate browser profiles or devices to create a room, join, and play.

For local Edge Function development, run `supabase start`, apply the migration and seed to the local database, then use `supabase functions serve game`. Keep local secrets in an untracked env file.

## Build and deploy the frontend on Render

```sh
npm run build
```

`render.yaml` configures the Vite build and `dist` publish directory, and asks for the two public Supabase client settings during setup. Render deploys static sites from a connected Git repository, then provides an `onrender.com` URL. Create a private GitHub/GitLab/Bitbucket repository for this source, connect that provider to Render, select **New > Blueprint**, and choose the repository. Enter `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when Render prompts for them. Deploy after the Supabase schema, seed data, and Edge Function are ready. Render's static-site setup is documented at [render.com/docs/static-sites](https://render.com/docs/static-sites).

No public game URL is included because this workspace has not been connected to a Git provider, Render account, or Supabase project.

## Backend notes

- `quiz_rooms`, `quiz_players`, `quiz_answers`, and `quiz_questions` have row-level security enabled and no browser read/write policies. Only the Edge Function's service role accesses them.
- `submit_quiz_answer` serializes writes by locking the room row, rejects duplicate or late answers, and computes points from server time. A correct answer is worth 100 points plus up to 50 speed points.
- `finalize_quiz_round` reveals the answer only after the authoritative deadline. If every player answers early, the final submission closes the round immediately.
- A room and its dependent records are removed after 24 hours when a new room is created. Reconnecting players reuse their session token; players joining a new room release their previous room membership.

## Current limits

- This repository does not include Supabase credentials or a hosted deployment. Online rooms become available after the setup above.
- The starter bank is intentionally compact. Its category-specific question set is unique within a match, while difficulty selection is a preference until the bank is expanded with 10 or more questions for every category/difficulty pair.
- Reconnection is tied to the same browser session. There is no account-based identity or cross-device recovery.
