# Faire Auth on Cloudflare Workers

Deploy a complete authentication system to Cloudflare Workers with D1 database and KV cache in one click.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/igoforth/faire-auth/tree/main/templates/cloudflare-deploy)

## Features

- Email/password authentication
- GitHub and Google OAuth
- D1 SQLite database
- KV namespace for caching
- Rate limiting
- Session management
- Zero configuration required

## Quick Start

1. Click the deploy button above
2. Follow the Cloudflare deployment flow
3. Your authentication system is ready!

## Configuration

The template includes:

- D1 database for user data
- KV namespace for session caching
- Pre-configured OAuth providers (GitHub, Google)
- Rate limiting (100 requests per minute)
- Secure cookie-based sessions

## Environment Variables

Set this in your Cloudflare Worker config:
- `FAIRE_AUTH_URL` - Public URL of your worker (can be worker.dev domain)

Upload these as Cloudflare Worker secrets:
- `FAIRE_AUTH_SECRET` - Secret key for signing tokens
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID (optional)
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret (optional)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (optional)
