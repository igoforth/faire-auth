# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Faire Auth is a comprehensive, framework-agnostic authentication and authorization library for TypeScript. It's built as a monorepo using pnpm workspaces and Turborepo, with packages designed to be composable and extensible through a plugin architecture.

## Repository Structure

### Core Packages

- **`packages/core`** - Low-level primitives and shared utilities
  - Contains crypto, database schema definitions, error handling, OAuth2 utilities, social providers, and type definitions
  - Exports include: `@faire-auth/core/crypto`, `@faire-auth/core/db`, `@faire-auth/core/error`, `@faire-auth/core/factory`, `@faire-auth/core/oauth2`, `@faire-auth/core/types`, `@faire-auth/core/utils`
  - Built with `tsdown` for both ESM and CJS outputs

- **`packages/faire-auth`** - Main authentication library
  - Depends on `@faire-auth/core` for primitives
  - Built on top of Hono for HTTP routing, uses OpenAPIHono for type-safe API definitions
  - Entry point is `src/auth.ts` which exports `faireAuth()` function
  - Initialization flow: `auth.ts` → `init.ts` → creates `AuthContext` → `api/index.ts` creates router
  - Contains adapters (Prisma, Drizzle, Kysely, MongoDB, Memory), client libraries (React, Vue, Svelte, Solid), integrations (Next.js, SvelteKit, etc.), and plugins

- **`packages/cli`** - Command-line interface (`@faire-auth/cli`)
  - Commands: `init`, `generate`, `migrate`, `secret`, `login`, `mcp`
  - Generates database schemas for different ORMs based on auth configuration

- **`packages/expo`** - Expo/React Native integration
- **`packages/stripe`** - Stripe payment integration plugin
- **`packages/playground`** - Development playground for testing

### Supporting Directories

- **`docs/`** - Next.js-based documentation site (https://faire-auth.com)
- **`demo/`** - Example applications (Next.js, Expo)
- **`e2e/`** - End-to-end tests
  - `e2e/integration/` - Integration tests with real frameworks
  - `e2e/smoke/` - Smoke tests for package installations and builds
- **`integration-tests/`** - Additional integration tests (Cloudflare workers, etc.)

## Architecture Concepts

### Plugin System

Faire Auth uses a plugin-based architecture. Plugins can:
- Add new API routes/endpoints
- Extend database schemas with new tables/fields
- Add client-side methods
- Define middleware and hooks
- Register custom error codes

Plugins implement the `FaireAuthPlugin` interface defined in `packages/faire-auth/src/types/plugin.ts`. During initialization, plugins are processed by `runPluginInit()` in `init.ts`, which can modify both the `AuthContext` and `FaireAuthOptions`.

### API Layer (Hono-based)

The API layer (`packages/faire-auth/src/api/`) uses Hono and OpenAPIHono to define type-safe, framework-agnostic HTTP endpoints:
- `api/index.ts` - Main router setup with middleware chain
- `api/routes/` - Core authentication routes (sign-in, sign-up, session, etc.)
- `api/factory/` - Endpoint and middleware creation utilities
- `api/middleware/` - Request handling middleware (context, hooks, rate limiting, origin check, error handling)

### Adapters

Database adapters (`packages/faire-auth/src/adapters/`) provide an abstraction layer over different databases/ORMs. All adapters implement the same interface defined in `@faire-auth/core/db/adapter`. The internal adapter (`db/internal-adapter.ts`) wraps the user's adapter and adds hooks support.

### Client Libraries

Client-side code (`packages/faire-auth/src/client/`) provides:
- Framework-agnostic vanilla client
- Framework-specific implementations (React, Vue, Svelte, Solid) with reactive state management
- Type inference based on server configuration
- Proxy-based API client that mirrors server routes

### Type Inference

Faire Auth heavily uses TypeScript's type inference:
- `$Infer` property on auth instance provides inferred types for Session, User, API, etc.
- Plugin types are merged into the main types using utility types like `InferPluginTypes`, `InferSession`, `InferUser`
- Client types are automatically inferred from server configuration

## Common Development Commands

### Building
```bash
# Build all packages
pnpm build

# Build with watch mode (packages only)
pnpm dev

# Build specific package
pnpm -F faire-auth build
pnpm -F @faire-auth/core build
```

### Testing
```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm -F faire-auth test

# Run specific test file
pnpm -F faire-auth test src/adapters/drizzle-adapter/test/adapter.drizzle.pg.test.ts

# Run tests with coverage
pnpm -F faire-auth test --coverage

# Run e2e smoke tests
pnpm e2e:smoke

# Run e2e integration tests
pnpm e2e:integration
```

Note: Tests use Vitest with multiple projects configured. Adapter tests require Docker containers for databases (PostgreSQL, MySQL, MongoDB, MSSQL).

### Linting & Formatting
```bash
# Format code with Biome
pnpm format

# Check for linting issues
pnpm lint

# Fix auto-fixable linting issues
pnpm lint:fix
```

Biome is configured to use tabs for indentation (except JSON files which use 2 spaces).

### Type Checking
```bash
# Type check all packages
pnpm typecheck

# Type check specific package
pnpm -F faire-auth typecheck
```

### Running Documentation Site
```bash
# Start docs dev server
pnpm -F docs dev
```

### CLI Development
```bash
# Run CLI commands during development
pnpm -F @faire-auth/cli dev

# Test CLI commands
npx @faire-auth/cli@latest generate
npx @faire-auth/cli@latest migrate
```

## Key Technical Details

### Build System
- Uses `tsdown` for building packages (both ESM and CJS)
- Turborepo orchestrates builds with proper dependency ordering
- Build outputs go to `dist/` directories
- Source maps and declaration files (.d.ts) are generated

### Testing Infrastructure
- Vitest for unit and integration tests
- Multiple test projects configured in `vitest.config.ts`:
  - `bench` - Benchmark tests
  - `adapters` - Database adapter tests (requires Docker services)
  - Main tests use `edge-runtime` environment
- MSW (Mock Service Worker) for mocking OAuth providers in tests
- Test utilities in `src/test-utils/` provide helpers for creating test auth instances

### Database Schema Generation
The CLI's `generate` command uses:
- `packages/cli/src/generators/` - Contains schema generators for different ORMs
- Reads auth configuration to determine which tables/fields are needed
- Outputs Prisma schema, Drizzle schema, or raw SQL depending on adapter

### Session Management
- Cookie-based sessions by default
- Session refresh handled by `client/session-refresh.ts`
- Cross-subdomain cookie support available
- JWT support available through plugins

### OAuth2 Implementation
- OAuth2 utilities in `@faire-auth/core/oauth2`
- Social providers defined in `social-providers/`
- State management for OAuth flows in `oauth2/state.ts`
- Account linking logic in `oauth2/link-account.ts`

## Development Workflow Notes

### Adding New Features
1. Determine if it should be in `core` (primitives) or `faire-auth` (implementation)
2. For new auth methods, consider implementing as a plugin
3. Update types in `types/` to ensure proper inference
4. Add corresponding client-side methods if needed
5. Update database schemas if new tables/fields are required
6. Add comprehensive tests

### Working with Adapters
- Adapter tests are in `src/adapters/*/test/`
- Use the test suite framework in `adapters/create-test-suite.ts`
- Docker Compose services defined in `docker-compose.yml` for databases
- Tests cover auth flows, transactions, performance, and edge cases

### Adding Social Providers
- Add provider definition in `social-providers/`
- Follow existing provider patterns (see `google.ts`, `github.ts`, etc.)
- Implement OAuth2 provider interface
- Add to exports in `social-providers/index.ts`

### Plugin Development
- Plugins are in `packages/faire-auth/src/plugins/`
- Each plugin exports a function that returns a `FaireAuthPlugin` object
- Plugins can define: `init`, `endpoints`, `schema`, `hooks`, `rateLimit`, `middleware`
- Client plugin code goes in plugin's `client.ts`

## Environment & Runtime
- Node.js version: 22.12.0
- pnpm version: 10.20.0
- Supports Node.js, Bun, Deno, Cloudflare Workers, and edge runtimes
- Environment detection in `@faire-auth/core/env`

## Important Conventions

### Commits
Follow conventional commit format for changelog generation:
- `feat(scope): description` - New features
- `fix(scope): description` - Bug fixes
- `docs: description` - Documentation changes
- `chore: description` - Non-functional changes
- Scope is optional for core changes, required for plugin-specific changes

### Pull Requests
- Target the `canary` branch for all PRs
- Keep PRs focused on a single feature or fix
- Open draft PRs early for discussion
- Ensure tests pass and code is formatted before requesting review

### Code Style
- No classes - use functions and objects
- Prefer explicit types over inference where it improves readability
- JSDoc comments for public APIs
- Avoid process.platform checks; use env utilities instead
- Faire Auth is a remix of Better Auth on Hono. New features Hooks, DTO, and Middleware are available. See when needed: packages/faire-auth/src/types/options.ts