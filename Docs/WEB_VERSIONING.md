# Web Versioning Strategy

## Goals
- Provide a predictable semantic version for every deployable build of the web workspace.
- Surface the current version inside the UI so support teams and users can quickly reference it.
- Keep the version source-of-truth alongside the codebase while allowing build metadata to reflect commit state.

## Semantic Versioning
- We follow [SemVer](https://semver.org/) in the format `MAJOR.MINOR.PATCH`.
- The canonical version string lives in `web/package.json` under the `version` field.
- Compatible change matrix:
  - `MAJOR` – breaking API or UI changes that require user re-education.
  - `MINOR` – new features delivered without breaking existing flows.
  - `PATCH` – bug fixes or dependency updates with no behaviour change.

## Build Metadata
- Each build augments the semantic version with short commit metadata: `MAJOR.MINOR.PATCH+commit.<hash>`.
- When `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, or `COMMIT_SHA` is present the first 7 characters are used.
- Local development falls back to `+dev.local` while still displaying the semantic version from `package.json`.
- The combined identifier is exposed to the client as `NEXT_PUBLIC_APP_BUILD`.

## Bump Workflow
1. Run `npm version <major|minor|patch>` from `web/` to update `package.json` and create a git tag (when the repo is initialised).
2. Commit the generated change with a meaningful message (e.g. `chore: bump web to 0.2.0`).
3. Push commits and tags so CI/CD can pick up the new version.
4. Trigger a deployment; the resulting build banner will show the new semantic version and matching commit suffix.

## Local Verification
- Start the dev server with `npm run dev` and confirm the version badge in the footer.
- Run `npm test` to execute unit tests that guard the version helper and environment wiring.
- For production builds run `npm run build && npm run start`; the version badge must match the `package.json` entry.

## Responsibilities
- Web maintainers own updating `web/package.json` during feature releases.
- Deployment automation should not mutate the semantic version; only append build metadata.
- Support and QA reference the footer badge when gathering reproduction details.
