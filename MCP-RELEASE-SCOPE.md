# MCP prerequisite release scope

The owner explicitly confirmed on 2026-09-14: canonical web scoring (1–3 stars, PP 18/22/26 and the three web badges), preserve historical passports, include outstanding changes in one release commit. Commit message includes `scoring: canonical=web` as documentation, not an automated-approval bypass.

Changes made for this prerequisite release:

- `lib/machine-resort.ts`: successful activities call existing `scoreActivity`; canonical 1–3 stars, 18/22/26 PP multipliers, existing web badge names. Admission checks, attempts and reward persistence are unchanged.
- `public/openapi.json`: actual canonical scoring; fix invalid operation references into valid Path Item references.
- `public/llms.txt`, `public/skill.md`, `public/agent-resort/SKILL.md`, `public/agent-offer.json`: permission boundary, scoring documentation and error instructions.

No schema migration is part of this release. No historical rewards are recalculated. No database deletion, credential rotation, admin-access change or change to state-changing API authentication is included. Existing production D1 ID and rate limiter remain in `wrangler.production.jsonc`. Deployment uses `--keep-vars`.

The wider dirty Git tree predates this MCP implementation. It includes previous Agent Resort work; it must not be reset or represented as newly authored by this task. A production deployment updates the whole built application, so the dirty-tree baseline cannot be inferred from Git HEAD alone.

Verification: `mcp/test/scoring-contract.test.mjs` executes the real web scorer and private machine evaluator in a module harness, checks equality, failed submissions, badge names and OpenAPI operation structure. MCP tests exercise all eight tool mappings, JSON preservation, error propagation, input validation, initialize/tools-list, Origin checks and rate limits. Seven tests passed. Site build and MCP Worker dry-run passed.

If automated deployment approval still declines this release, leave production untouched and request explicit approval for this documented scope. Do not use the Cloudflare connector to bypass that decision.
