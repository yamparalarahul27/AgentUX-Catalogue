# Telegram Bot — Screenshot Upload

## What it does

A Supabase Edge Function that receives images via a Telegram bot and uploads
them to the catalogue as screenshots in the **"Social"** group.

- Sends image on Telegram → bot uploads to Supabase Storage + inserts into
  `screenshots` table → visible in `/designer/catalogue` under "Social" group.
- Auto-names screenshots as `social-YYYY-MM-DD-NNN`.
- Always uploads to the default (first) project.
- Restricted to allowed Telegram user IDs.

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

Send `/start` to the bot on Telegram. It should reply with a welcome message.
Then send an image — it should reply with the uploaded screenshot name.

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
