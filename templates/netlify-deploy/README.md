# Faire Auth on Netlify

Deploy a complete authentication system to Netlify with Turso SQLite database in one click.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/igoforth/faire-auth&create_from_path=templates/netlify-deploy&fullConfiguration=true#FAIRE_AUTH_URL=https://your-app.netlify.app&FAIRE_AUTH_SECRET=)

## Features

- Email/password authentication
- GitHub and Google OAuth
- Turso SQLite database
- Session management
- Zero configuration required

## Quick Start

1. Click the deploy button above
2. Follow the Netlify deployment flow
3. Your authentication system is ready!

## Configuration

The template includes:

- Turso database for user data
- Pre-configured OAuth providers (GitHub, Google)
- Secure cookie-based sessions

## Environment Variables

Set these in your Netlify project:
- `FAIRE_AUTH_URL` - Public URL of your project (can be netlify.app domain)
- `FAIRE_AUTH_SECRET` - Secret key for signing tokens
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID (optional)
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret (optional)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (optional)
