# Environment Variable Acquisition Guide

This project uses a `.env` file for local development and expects each credential to come from its upstream provider. The sections below walk through how to obtain every value, including pointers to the relevant dashboards and the exact buttons to click.

> For production deployments, store the same secrets in your secret manager of choice instead of committing `.env`.

## Discord Application Credentials

The Discord settings live in the [Discord Developer Portal](https://discord.com/developers/applications).

- `DISCORD_CLIENT_ID`
  1. Sign in to the Developer Portal and select your application (create one if you do not have it yet).
  2. The **Application ID** shown on the **General Information** page is the value for `DISCORD_CLIENT_ID`.
- `DISCORD_PUBLIC_KEY`
  1. The same **General Information** page lists the **Public Key** under the **Interactions Endpoint URL** section.
  2. Copy the entire string (a 64-character hex value) into `DISCORD_PUBLIC_KEY`. This is required if you use HTTP interactions or verify signatures manually.
- `DISCORD_TOKEN`
  1. Navigate to **Bot** in the left-hand sidebar and click **Reset Token** or **Copy Token**.
  2. Discord will display a modal; choose **Copy**. Keep this secret—treat it like a password.
  3. Paste it into `DISCORD_TOKEN`. If you regenerate it later, update the `.env`.

> After creating the bot, invite it to your test server using the **OAuth2 → URL Generator** with scopes `bot` and `applications.commands`, plus permissions like `Send Messages` if needed.

## GitHub App Credentials

These values come from a GitHub App that owns the permissions to perform repository search.

- `GITHUB_APP_ID`
  1. Visit your GitHub App configuration page: `https://github.com/settings/apps/<your-app-name>`.
  2. The **About** section lists the **App ID**. Copy it to `GITHUB_APP_ID`.
- `GITHUB_APP_PRIVATE_KEY`
  1. On the same GitHub App page, scroll to **Private keys**.
  2. Click **Generate a private key**. GitHub downloads a `.pem` file.
  3. Open the file in a text editor and paste the full contents, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines, into the `.env`. Wrap it in single quotes if you keep it on one line, or use multiline syntax supported by your environment.
- `GITHUB_INSTALLATION_ID`
  1. Install the GitHub App on the organization or repository that the bot should access.
  2. After installation, GitHub redirects to a URL like `https://github.com/organizations/<org>/settings/installations/<installation_id>`.
  3. The trailing number is the `GITHUB_INSTALLATION_ID`. You can also fetch it via the REST API (`GET /app/installations`) if you prefer.

**Recommended App permissions**

- Repository permissions: `Contents: Read-only`, `Metadata: Read-only`, `Code scanning alerts: Read-only` if you want security context later.
- Event subscriptions: none required for this bot.

## Asana Configuration

- `ASANA_ACCESS_TOKEN`
  1. Log in to Asana and open **Developer App Management** from the profile menu.
  2. Under **Personal access tokens**, click **Create new token**, give it a descriptive name, and generate it.
  3. Copy the token once—it will not be shown again—and store it in `ASANA_ACCESS_TOKEN`.
- `ASANA_PROJECT_GID`
  1. Open the target project in Asana using the web UI.
  2. Observe the URL: `https://app.asana.com/0/<project_gid>/list`. The middle segment is the numeric GID.
  3. Copy that value into `ASANA_PROJECT_GID`.
- `ASANA_SECTION_GID`
```text
ASANA_TOKEN="pat_xxx"
PROJECT_GID="1234567890123456"

curl -s \
  -H "Authorization: Bearer $ASANA_TOKEN" \
  "https://app.asana.com/api/1.0/projects/$PROJECT_GID/sections" \
| jq '.data[] | {name:.name, gid:.gid}'
```

## OpenAI API Key

- `OPENAI_API_KEY`
  1. Visit [platform.openai.com](https://platform.openai.com/) and sign in.
  2. Open **API keys** (top-right avatar → **View API keys**).
  3. Click **Create new secret key**, optionally give it a name, and copy the generated key immediately.
  4. Paste the value into `OPENAI_API_KEY`. Each key begins with `sk-`. Rotate it periodically according to your security policies.

## Populating the `.env` File

1. Duplicate `.env.example` if you have one, or copy the structure from `.env`.
2. Fill every variable described above.
3. Keep the file out of version control (`.gitignore` already ignores `.env` by default).
4. Reload your development environment (`npm run dev`) after changing secrets so the new values take effect.

> Tip: for team sharing, upload the finalized key/value pairs to a secure secret vault (AWS Secrets Manager, 1Password, Doppler, etc.) instead of emailing them.
