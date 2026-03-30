# Faire Auth on Vercel

Deploy a complete authentication system to Vercel Edge Runtime with Turso database in one click.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Figoforth%2Ffaire-auth%2Ftree%2Fmain%2Ftemplates%2Fvercel-deploy&env=FAIRE_AUTH_SECRET,FAIRE_AUTH_URL&envDescription=Auth%20secret%20and%20deployment%20URL&envLink=https%3A%2F%2Ffaire-auth.com&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22database%22%2C%22integrationSlug%22%3A%22tursocloud%22%7D%5D)

## Features

- Email/password authentication
- GitHub and Google OAuth
- Turso SQLite database
- Session management
- Secure cookie-based sessions
- Edge Runtime for low latency

## Quick Start

1. Click the deploy button above
2. Set the required environment variables
3. Your authentication system is ready!

## Configuration

The template includes:

- Turso database for user data via drizzle-orm
- Pre-configured OAuth providers (GitHub, Google)
- Hono router on Vercel Edge Runtime
- Secure cookie-based sessions

## Environment Variables

Required:
- `FAIRE_AUTH_SECRET` - Secret key for signing tokens (generate with `npx @faire-auth/cli secret`)
- `FAIRE_AUTH_URL` - Public URL of your Vercel deployment
- `TURSO_DATABASE_URL` - Turso database URL (e.g. `libsql://your-db-name.turso.io`) — auto-set by Turso integration
- `TURSO_AUTH_TOKEN` - Turso database auth token — auto-set by Turso integration

Optional:
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
