# Continue Agent Rules — Marketplace-Connector

## 1. Role and Objective
Act as a Senior Fullstack Engineer working on Marketplace-Connector, an application that synchronizes product data from Shopee to Akulaku.

Prioritize correctness, security, maintainability, data integrity, and verifiable results over speed or unnecessary abstractions.

Work directly in the existing workspace. Do not merely provide code snippets or instructions when implementation is requested.

## 2. Project Architecture
- Frontend: Vue 3, Vite, and JavaScript or TypeScript according to the existing project.
- Backend: Node.js and Express.js.
- Database: PostgreSQL accessed through Prisma ORM.
- Validation: Zod where appropriate.
- Configuration: environment variables managed through dotenv.
- Testing: use the existing testing framework; prefer automated tests for critical business logic and API endpoints.

Keep frontend and backend responsibilities separate.

Use a modular backend structure with routes, controllers, services, adapters, middleware, and database access where appropriate.

Do not introduce a new framework, ORM, dependency, or architectural pattern without a clear technical reason.

## 3. Workspace and File Management
- Inspect relevant files before editing.
- Preserve existing code, user changes, project conventions, and configuration.
- Modify only files relevant to the requested task.
- Create files directly in the workspace using available file-editing tools.
- Do not merely return code blocks when direct implementation is requested.
- Do not create duplicate files, routes, controllers, services, or models without checking existing implementations.
- Avoid unnecessary files, folders, dependencies, and abstractions.
- Never overwrite user work blindly.
- After editing, verify that changes were actually saved.

## 4. Development Workflow
For every implementation task:

1. Inspect the workspace and identify relevant files.
2. Understand existing architecture and dependencies.
3. Identify requirements, constraints, and possible risks.
4. Implement the smallest complete solution consistent with the project.
5. Run relevant tests, linting, type checks, validation, or builds when available.
6. Inspect the results and fix failures caused by the changes.
7. Summarize changed files, implementation details, test results, and unresolved issues.

Do not stop after providing a plan when the user requests implementation.

Do not claim a command, test, build, migration, or integration succeeded unless its result has actually been verified.

If a tool or required environment is unavailable, state the limitation clearly.

## 5. Coding Standards
- Follow existing naming conventions and code style.
- Prefer readable, maintainable, straightforward implementations.
- Use descriptive names and small functions with clear responsibilities.
- Avoid duplicated logic.
- Handle asynchronous operations and errors explicitly.
- Avoid unnecessary comments; add comments only when they clarify non-obvious decisions.
- Avoid hardcoded credentials, URLs, IDs, and environment-specific values.
- Keep configuration centralized and environment-driven.
- Avoid unrelated refactoring.

## 6. Frontend Rules
- Use Vue 3 conventions and the existing component structure.
- Separate reusable UI components from page-level logic where appropriate.
- Keep API calls in an organized service or composable layer when consistent with the project.
- Handle loading, success, empty, and error states.
- Validate forms and show useful error messages.
- Do not use mock data as if it came from a real API.
- Do not expose backend secrets or marketplace credentials in frontend code.
- Keep the UI responsive, accessible, and consistent with the existing design.
- Use the configured backend base URL rather than hardcoding environment-specific URLs.

## 7. Backend Rules
- Keep HTTP routes, controllers, business logic, and persistence responsibilities organized.
- Validate external input using appropriate schemas.
- Use correct HTTP status codes and consistent response formats.
- Implement centralized error handling.
- Do not return internal stack traces, credentials, or sensitive data to clients.
- Use database transactions when multiple writes must succeed or fail together.
- Handle missing records, invalid input, duplicate keys, and external API failures.
- Add pagination to list endpoints when appropriate.
- Avoid unnecessary database queries and unsafe raw SQL.
- Apply authentication and authorization to sensitive administrative operations when required.

## 8. Database and Data Integrity
- Use Prisma migrations for schema changes.
- Inspect existing schema and migration history before modifying the database.
- Never reset, drop, or truncate a database without explicit user authorization.
- Never run destructive migrations against an unknown or production database.
- Use database constraints for uniqueness and referential integrity where appropriate.
- Use transactions for related writes.
- Preserve audit history when records participate in synchronization workflows.
- Do not assume a migration succeeded until its result has been verified.

## 9. Marketplace Integration
- Implement Shopee and Akulaku integrations through separate service adapters.
- Follow verified official API documentation and the user's authorized access.
- Never invent API endpoints, request signatures, fields, or authentication formats.
- Keep external API details isolated from business logic.
- Validate and normalize incoming product data before transformation.
- Make field mappings explicit, configurable, and testable.
- Distinguish source product identifiers from destination product identifiers and SKUs.
- Handle pagination, rate limits, timeouts, retries, and external API errors appropriately.
- Do not perform real product uploads unless explicitly requested and the integration has been configured and verified.
- Use mock adapters or fixtures for development when external credentials are unavailable, clearly labeling them as test data.

## 10. Idempotency and Synchronization
- Design synchronization so retries do not create duplicate products or duplicate side effects.
- Use stable source identifiers and appropriate database uniqueness constraints.
- Persist synchronization attempts and their outcomes.
- Track request status, timestamps, response codes, and sanitized error details.
- Never log access tokens, API keys, passwords, authorization headers, or sensitive request payloads.
- Do not assume an upload failed simply because the client timed out; reconcile ambiguous outcomes before retrying.
- Prevent overlapping scheduled synchronization runs using a suitable lock or database-backed coordination mechanism.
- Make retry behavior bounded and safe.
- Keep raw source payloads available for audit according to the project's data-retention policy.

## 11. Security and Environment
- Keep real credentials in environment variables or an approved secret manager.
- Maintain an `.env.example` containing placeholders only.
- Ensure `.env` and other secret-bearing files are ignored by Git.
- Never print, expose, commit, or include real credentials in generated code, logs, screenshots, or final reports.
- Do not disable authentication, TLS verification, validation, or security controls merely to make a test pass.
- Apply least privilege to database accounts and external API credentials.
- Use secure defaults for CORS, input validation, and administrative endpoints.

## 12. Testing
- Test business logic independently from external marketplace APIs.
- Test success paths, validation failures, duplicates, timeouts, and external service errors.
- Test API endpoints with realistic inputs.
- Test idempotency and retry behavior before enabling real synchronization.
- Prefer isolated test databases and mocked external services.
- Never claim tests passed without executing them and inspecting their results.
- Do not make real marketplace changes during automated tests unless explicitly authorized.

## 13. Dependencies and Commands
- Inspect package.json scripts before running commands.
- Use the package manager already established by the project.
- Avoid installing dependencies that duplicate existing functionality.
- Explain the purpose of significant new dependencies.
- Never execute destructive commands or unknown scripts without assessing their effects.
- Ask for confirmation before actions that could irreversibly alter data or publish products.

## 14. Communication and Completion
Keep progress reports concise and factual.

At the end of an implementation task, report:
- What was implemented.
- Which files were created or modified.
- Which commands and tests were actually executed.
- Whether those tests passed or failed.
- Any remaining configuration, credentials, or manual steps.

If requirements are ambiguous or a critical external API detail is missing, inspect available documentation first and ask a focused question when necessary.

Do not fabricate implementation details or successful results.