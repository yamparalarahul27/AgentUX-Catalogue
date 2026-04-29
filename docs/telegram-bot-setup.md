# Telegram Bot — Catalogue Capture

## What it does

A Supabase Edge Function that receives input via a Telegram bot and routes it
to the catalogue:

- **Image** → uploads to Supabase Storage + inserts into `screenshots` table
  in the **"Social"** group, visible at `/designer/catalogue`.
  Auto-named `social-YYYY-MM-DD-NNN`. Always uses the default (first) project.
- **X / Twitter post URL** → inserts into `catalogue_video_references`,
  visible at `/designer/catalogue` under the **Videos** tab.
- **Any other URL** → inserts into `catalogue_link_references`, visible at
  `/designer/catalogue` under the **Links** tab.

Restricted to allowed Telegram user IDs.

A single text message containing both an X URL and another URL is split:
the X URL goes to Videos, the rest go to Links. Duplicates are detected via
unique constraints and reported back without re-inserting.

## Required SQL migrations

Run these in the Supabase SQL editor before deploying the function:

- `designer/sql/catalogue-videos.sql` — `catalogue_video_references` table
- `designer/sql/catalogue-links.sql` — `catalogue_link_references` table

## Bot info

- **Bot**: @Catlog7_bot
- **Function**: `supabase/functions/telegram-bot/index.ts`
- **Endpoint**: `https://<project-ref>.supabase.co/functions/v1/telegram-bot`

## Setup (one-time)

### 1. Set secrets

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=<bot-token-from-botfather>
supabase secrets set ALLOWED_TELEGRAM_USER_IDS=<your-telegram-user-id>
```

### 2. Deploy the function

```bash
supabase functions deploy telegram-bot --no-verify-jwt
```

The `--no-verify-jwt` flag is required because Telegram sends raw POST
requests without a Supabase JWT.

### 3. Register the webhook with Telegram

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<project-ref>.supabase.co/functions/v1/telegram-bot"
```

Replace `<TOKEN>` with the bot token and `<project-ref>` with your Supabase
project reference ID.

### 4. Verify

Send `/start` to the bot on Telegram. It should reply with a welcome message
listing the three capture flows. Then try each:

- Send an image → bot replies with the uploaded screenshot name.
- Send an X / Twitter post URL → bot replies with `Added 1 video: ...`.
- Send any other URL (e.g. a Figma file or article) → bot replies with
  `Added 1 link: ...`.

## Redeploying after changes

```bash
supabase functions deploy telegram-bot --no-verify-jwt
```

No need to re-register the webhook — it persists.

## Adding more allowed users

```bash
supabase secrets set ALLOWED_TELEGRAM_USER_IDS=6617110970,OTHER_USER_ID
supabase functions deploy telegram-bot --no-verify-jwt
```

## Troubleshooting

Check Edge Function logs in the Supabase dashboard:
**Dashboard → Edge Functions → telegram-bot → Logs**
