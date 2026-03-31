# Usage

## Setup

1. Install the **Turso** extension from the Netlify Extensions page
2. Connect your Turso account and select a database
3. The `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` environment variables will be set automatically
4. Set `FAIRE_AUTH_SECRET` — generate one with `npx @faire-auth/cli secret`
5. Set `FAIRE_AUTH_URL` to your Netlify site URL (e.g. `https://your-site.netlify.app`)

## Optional: OAuth Providers

To enable GitHub or Google OAuth, set the corresponding environment variables in your Netlify site settings:

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
