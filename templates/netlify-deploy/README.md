# Faire Auth on Netlify

Deploy a complete authentication system to Netlify with Turso database in one click.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/igoforth/faire-auth&branch=main&base=templates/netlify-deploy&create_from_path=templates/netlify-deploy/&fullConfiguration=true#FAIRE_AUTH_URL=https://your-site.netlify.app&FAIRE_AUTH_SECRET=)

## Features

- Email/password authentication
- GitHub and Google OAuth
- Turso SQLite database
- Session management
- Secure cookie-based sessions
- Netlify Functions (Node.js)

## Quick Start

1. Click the deploy button above
2. Install the Turso extension when prompted
3. Set the required environment variables
4. Your authentication system is ready!

## Configuration

The template includes:

- Turso database for user data via drizzle-orm
- Pre-configured OAuth providers (GitHub, Google)
- Hono router on Netlify Functions
- Secure cookie-based sessions

## Environment Variables

Required:
- `FAIRE_AUTH_SECRET` - Secret key for signing tokens (generate with `npx @faire-auth/cli secret`)
- `FAIRE_AUTH_URL` - Public URL of your Netlify site (e.g. `https://your-site.netlify.app`)
- `TURSO_DATABASE_URL` - Turso database URL — auto-set by Turso extension
- `TURSO_AUTH_TOKEN` - Turso database auth token — auto-set by Turso extension

Optional:
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
