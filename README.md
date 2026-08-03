# TradeVault V1 — iPad Deployment

This version has:

- No build step
- No Vercel environment variables
- No folders required
- No `package.json`
- No `build.mjs`

## Files to upload

Upload these five files individually to the root of your GitHub repository:

- app.js
- index.html
- manifest.webmanifest
- styles.css
- vercel.json

Delete the old `build.mjs` and `package.json` files from the repository, or create a new repository containing only these five files.

## Deploy on Vercel

Import the repository into Vercel.

Vercel should deploy it as a static site without running `npm run build`.

You do not need to add environment variables.

## First launch

When the website opens, TradeVault asks for:

- Supabase Project URL
- Supabase publishable or anon key

These are the browser-safe values from Supabase. They are saved in the browser on that device.

Never enter:

- service_role key
- sb_secret key

## Authentication configuration

After Vercel gives you the live URL, open Supabase:

Authentication → URL Configuration

Set the Site URL to your Vercel URL and add:

https://YOUR-VERCEL-URL.vercel.app/auth/callback

## Add to iPad or iPhone Home Screen

Open the live site in Safari, tap Share, then Add to Home Screen.
