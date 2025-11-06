# Discord → GitHub-aware → Asana Task Bridge

> Production-grade Discord bot that turns a natural-language request into a well-formed Asana task, using OpenAI for task extraction and GitHub code search for context. Designed for reliability, security, and maintainability.

---

## 1) Executive Summary

This service exposes a **Discord slash command** that captures a user’s description, enriches it with **context from your GitHub codebase**, extracts a structured task using the **OpenAI Responses API**, and **creates the task in Asana** in a specified project section such as **“To do.”**

The design follows current best practices:

- **Discord Application Commands** (slash commands) for predictable UX and minimal privileged scopes. Message Content intent is **not required**.
- **GitHub App** with **read‑only** scopes for code search. Installation tokens are rotated by GitHub and scoped to the org/repo.
- **OpenAI Responses API** with **JSON-schema constrained output** for machine-parseable results.
- **Asana Tasks API** using `memberships` to place the task directly into the desired section at creation.
- **Node.js 20+ with TypeScript**, structured logging, strong typing, and test coverage.
- **12-factor configuration**, containerized deployments, CI with tests and linting, and idempotent task creation.

> Non-goal: This bot does not modify your codebase. It only **searches** for relevant context and links to results inside Asana tasks.

---

## 2) High-level Architecture
### Request flow

1. The user runs `/task ...` in Discord.
2. The Discord App/Gateway forwards the request to the **Task Orchestrator**.
3. The Task Orchestrator consults **Config + small DB** for settings and state.
4. The Task Orchestrator fans out:

   * Calls the **GitHub App Adapter / Code Search** and receives top-K snippets and links.
   * Calls the **OpenAI Responses API** and receives a JSON task payload.
   * Calls the **Asana API** to create a task in the target **Asana Project** under the “To do” section.
5. Asana returns the created task. The Task Orchestrator captures the **Asana task URL**.
6. The Task Orchestrator sends the **Asana task URL** back to the **Discord App/Gateway**.
7. The Discord App/Gateway posts an **ephemeral reply** to the requesting **Discord User** with the task link.

### Components

* **Discord User**: initiates `/task`.
* **Discord App/Gateway**: receives the command and relays responses.
* **Task Orchestrator**: central controller for all calls and data flow.
* **GitHub App Adapter / Code Search**: returns top-K code snippets and links.
* **OpenAI Responses API**: returns a structured JSON task payload.
* **Asana API**: creates the task in the project’s “To do” section.
* **Config + small DB**: stores configuration and minimal state.
* **Asana Project (“To do” Section)**: destination for the created task.

### Data exchanged

* From GitHub Adapter to Orchestrator: **top-K snippets/links**.
* From OpenAI API to Orchestrator: **JSON task payload**.
* From Asana API to Orchestrator: **task details and URL**.
* From Orchestrator to Discord App/Gateway: **Asana task URL**.
* From Discord App/Gateway to User: **ephemeral reply** containing the task link.


### Request sequence

```mermaid
sequenceDiagram
    participant U as User
    participant Di as Discord
    participant Or as Orchestrator
    participant Gh as GitHub App
    participant Ai as OpenAI
    participant As as Asana

    U->>Di: /task describe:"…" [project, section, priority]
    Di->>Or: Interaction payload
    Or->>Gh: Search code (qualifiers: org/repo, in:file, language)
    Gh-->>Or: Top-K items (paths, URLs)
    Or->>Ai: Prompt + snippet URLs, JSON schema
    Ai-->>Or: { title, body, labels[] }
    Or->>As: Create task with memberships → "To do"
    As-->>Or: { task.gid, task.url }
    Or-->>Di: Ephemeral reply with Asana link
    Di-->>U: "Created: <asana url>"
```

---

## 3) Why these choices

- **Slash commands over mentions**: Stable interaction model and least privileged access. Message content intent is optional and often unnecessary.
- **GitHub App over PAT**: Org‑scoped access, better auditability, automatic token rotation, easy revocation.
- **OpenAI Responses API**: Enforces **consistent JSON** shape via `response_format: json_schema`. This removes brittle “parse the text” logic.
- **Asana `memberships` on create**: Single API call to place a task into a **specific section**. Fallback: `POST /sections/{section_gid}/addTask`.
- **TypeScript**: Safer refactors, strict contracts, and clearer integration boundaries.

---

## 4) Capabilities

- `/task` command produces:
  - **Title**: concise, action-oriented.
  - **Body**: summary, acceptance criteria, and links to related code paths.
  - **Labels**: optional tags like `p0`, `infra`, `docs`.
  - **Asana placement**: Project + Section (e.g., **“To do”**).
- **Pluggable search providers**: REST or GraphQL for GitHub code search.
- **Idempotency guard**: Same Discord interaction ID creates at most one Asana task.
- **Observability**: Structured logs with correlation IDs and counters for rate limits and errors.

---

## 5) Security Model

- **Discord**: Use Application Commands. Avoid Message Content intent unless explicitly needed. Store only interaction metadata that you actually require.
- **GitHub**: GitHub App, read-only scopes (`contents:read`, `metadata:read`, `security_events:read` if you later enrich). Use **installation tokens**.
- **OpenAI**: Send only non-sensitive summaries of code hits (e.g., URLs and short digests). Do not ship raw source unless your policy allows it.
- **Asana**: Use OAuth or PAT stored in a secrets manager. Handle `429` with exponential backoff.
- **Secrets**: Keep all credentials in a **cloud secrets manager**. Do not commit `.env` to VCS. Prefer workload identities where available.

---

## 6) Repository Layout

```
.
├─ src/
│  ├─ index.ts                 # Discord client bootstrap
│  ├─ modules/
│  │  └─ handleTask.ts        # Slash command handler
│  ├─ services/
│  │  ├─ github.ts            # GitHub search provider(s)
│  │  ├─ openai.ts            # Task extraction with JSON schema
│  │  └─ asana.ts             # Task creation + section placement
│  ├─ lib/
│  │  ├─ logger.ts            # pino/winston wrapper
│  │  └─ retry.ts             # backoff helpers
│  └─ types/
│     └─ task.ts              # shared interfaces
├─ scripts/
│  └─ register-commands.ts    # One-time slash command registration
├─ test/                      # unit + integration tests
├─ Dockerfile
├─ docker-compose.yml         # optional for local deps
├─ package.json
├─ tsconfig.json
└─ README.md
```

---

## 7) Prerequisites

- Node.js **20+** and npm.
- A Discord **Application** with a Bot user and the **Guilds** intent.
- A **GitHub App** installed on the org or target repos with **read-only** scopes.
- An **Asana** workspace with the target **Project** and the **“To do”** section.
- An **OpenAI** API key with access to a Responses-capable model.

---

## 8) Configuration

Create a `.env` file for local development. In production use your cloud secret manager instead.

```bash
# Discord
DISCORD_TOKEN=
DISCORD_CLIENT_ID=

# GitHub (App)
GH_APP_ID=
GH_APP_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
# Either hardcode or resolve dynamically per org/installation:
GH_INSTALLATION_ID=

# Asana
ASANA_ACCESS_TOKEN=
ASANA_PROJECT_GID=
ASANA_SECTION_GID=  # "To do" section GID is preferred over name

# OpenAI
OPENAI_API_KEY=
```

> **Tip**: If you only know the Asana **section name**, you can look up its **GID** via the Asana API or UI. Using a GID avoids ambiguity and extra lookups.

---

## 9) Install and bootstrap

```bash
# install
npm ci

# register slash commands globally
npm run deploy:commands

# run locally (ephemeral replies to you only)
npm run dev
```

**Common scripts** (excerpt from `package.json`):

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "deploy:commands": "tsx scripts/register-commands.ts",
    "test": "vitest run"
  }
}
```

---

## 10) Discord command UX

- Primary command: `/task`
- Options:
  - `describe` (required): Free text description.
  - `project` (optional): Asana project GID; defaults from config.
  - `section` (optional): Section GID or name; GID preferred.
  - `priority` (optional): `p0|p1|p2` with `p2` as default.

The bot responds with an **ephemeral** message containing the Asana task URL and a small audit trail (project, section, priority).

---

## 11) GitHub search strategy

- Default qualifiers: `org:<your-org> in:file language:ts|js|py|go`
- Return **top-K** results (e.g., 5). Provide **URLs** and, if policy allows, small **digest snippets**.
- Support **REST** `/search/code` and optional **GraphQL** `search(type: CODE, ...)` behind a common interface.
- Scope queries by repo, language, filename patterns, and optionally `path` if using GraphQL or when supported by the API flavor you choose.

**Provider interface** (conceptual):

```ts
export interface RepoHit { repo: string; path: string; url: string; digest?: string }
export interface CodeSearchProvider {
  findRepoContext(query: string, opts?: { k?: number }): Promise<RepoHit[]>
}
```

---

## 12) Task extraction with OpenAI

Use the **Responses API** with a **JSON Schema** to enforce deterministic output:

```ts
const schema = {
  name: "task_payload",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      body: { type: "string" },
      labels: { type: "array", items: { type: "string" } }
    },
    required: ["title", "body"]
  },
  strict: true
} as const;
```

**Prompt content** includes:
- User free text
- Any explicit priority
- List of code URLs and short digests

**Guidance to the model**:
- Produce a concise **title**.
- Write a **body** with summary, acceptance criteria, and inline links to code hits.
- Add lightweight **labels** when obvious (`p0|p1|p2`, `infra`, `docs`, etc.).
- Keep private details out unless governance permits their transmission.

---

## 13) Create the Asana task

Prefer **single-call** creation where the task is placed directly into the desired section using `memberships`. Example shape (TypeScript pseudo‑code):

```ts
const task = await client.tasks.createTask({
  name: title,
  notes: body,
  projects: [projectGid],
  memberships: [{ project: projectGid, section: sectionGid }],
  // optional: assignee, due_on, followers, custom_fields
});
```

If you cannot place at creation time, fall back to:

```ts
await client.sections.addTaskForSection(sectionGid, { task: task.gid });
```

Return the canonical URL: `https://app.asana.com/0/${projectGid}/${task.gid}`.

---

## 14) Idempotency, retries, and rate limits

- **Idempotency**: Use the Discord **interaction ID** as a natural idempotency key. Before creating a task, check a small store (SQLite/Postgres/Redis) to ensure you have not already created one for that interaction.
- **Retries**: For transient failures (`429`, `5xx`, network), use **exponential backoff with jitter**. Cap the number of attempts and surface a clear error to the user on final failure.
- **Provider specifics**:
  - **OpenAI**: monitor TPM/RPM and handle `429` carefully.
  - **Asana**: expect `429` under bursts; back off and retry.
  - **GitHub**: search APIs are rate-limited; combine qualifiers to be efficient.

---

## 15) Observability

- **Structured logs**: JSON logs with fields `{correlation_id, guild_id, user_id, interaction_id, provider, status}`.
- **Metrics**: counters for `tasks_created_total`, `provider_errors_total{provider=…}`, `rate_limit_events_total`, and latency histograms.
- **Tracing**: optionally add OpenTelemetry instrumentation around provider calls.

---

## 16) Testing strategy

- **Unit tests**: Prompt contract tests to validate schema conformance; helpers for redacting sensitive content.
- **Integration tests**: Mock GitHub/Asana/OpenAI with recorded fixtures (VCR style). Ensure section placement works as expected.
- **E2E**: In a test guild and Asana project, assert the bot creates a task and replies ephemerally with the link.

Run tests:

```bash
npm test
```

---

## 17) Deployment

### Container

`Dockerfile` (illustrative only):

```Dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

### Automated deployment

The pipeline now targets **Google Cloud Run** (see `docs/deploy-setup.md` for a full checklist):

- `Dockerfile` builds the production image for Artifact Registry.
- `.github/workflows/deploy.yml` runs on pushes to `main`, authenticates via Workload Identity Federation, pushes the image to Artifact Registry, and rolls out a new Cloud Run revision.
- Runtime secrets are sourced from **Secret Manager** (one secret per environment variable).

**GitHub Actions secrets required**

- `GCP_PROJECT_ID`: Google Cloud project ID hosting the service.
- `GCP_REGION`: Cloud Run & Artifact Registry region (e.g., `us-central1`).
- `GCP_ARTIFACT_REPOSITORY`: Artifact Registry Docker repository name.
- `GCP_SERVICE`: Cloud Run service name.
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: Full resource name of the Workload Identity provider (step 6 in `docs/deploy-setup.md`).
- `GCP_SERVICE_ACCOUNT`: Deploy service account email that the workflow impersonates.

After a merge to `main`, the action will:

1. Run `npm ci`, `npm test -- --passWithNoTests`, and `npm run build`.
2. Build the Docker image and push `REGION-docker.pkg.dev/PROJECT/REPO/disubana` with both `${GITHUB_SHA}` and `latest` tags.
3. Deploy Cloud Run with `NODE_ENV=production` and bind each required environment variable to the latest Secret Manager version.

> Cloud Run handles scaling and patching automatically—no SSH access, Docker hosts, or manual `.env` sync is required once the setup guide is complete.

---

## 18) Operational runbook

- **Bot not responding**: Check Discord gateway status and token validity. Re-deploy slash commands if IDs changed.
- **Asana section mismatch**: Confirm `ASANA_SECTION_GID`. Names are ambiguous; prefer GID.
- **GitHub search returns nothing**: Loosen qualifiers. Try fewer language constraints. Verify installation has repo access.
- **Persistent 429s**: Lower concurrency. Add jitter to backoff. Consider provider quotas and contact support if sustained.
- **OpenAI JSON parsing errors**: The Responses API with JSON Schema should make output deterministic. If issues persist, reduce prompt complexity and K (top‑K hits).

---

## 19) Extensibility

- **Additional providers**:
  - Other source-of-truth: GitLab, Bitbucket.
  - Other PM sinks: Jira, Linear, Trello.
- **Domain adapters**: add a mapping layer to convert task payloads to the fields of your target PM tool.
- **Access control**: per‑guild or per‑channel policies; restrict which users may create tasks for which projects.

---

## 20) FAQ

- **Can it work with “@mention” instead of `/task`?** Yes, but you would need the **Message Content intent**. This increases the permission surface. Slash commands are recommended.
- **Does it store source code?** No. By default it stores only the minimal metadata to achieve idempotency and diagnostics.
- **What about multi‑project routing?** Add a small DB table mapping Discord guild/channel to Asana project/section defaults.
- **How do we attach files or images?** Extend the Asana call to include attachments or link external artifacts.

---

## 21) License

Choose a license that suits your organization. MIT is common for internal tooling, but consult legal requirements first.

---

## 22) Getting started checklist

1. Create a **Discord Application**, add a Bot user, copy **token** and **client ID**.
2. Create and install a **GitHub App** with read-only scopes; record **App ID**, **private key**, and **installation ID**.
3. In Asana, locate your **Project GID** and **“To do” Section GID**.
4. Create an **OpenAI** API key with access to a Responses-capable model.
5. Fill `.env` with the above values.
6. `npm ci && npm run deploy:commands && npm run dev`
7. In Discord, run `/task describe:"Create onboarding guide" priority:p2` and confirm a task appears in Asana.

---

## 23) Change log

- **v0.1.0**: Initial implementation and project skeleton.
- **v0.2.0**: Add idempotency guard and structured logging.
- **v0.3.0**: Add GraphQL GitHub search provider and configurable qualifiers.
- **v0.4.0**: Optional message-content flow and policy gates.

---

## 24) Appendix: Configuration table

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DISCORD_TOKEN` | yes | `mfa.xxxxx` | Bot token |
| `DISCORD_CLIENT_ID` | yes | `123456789012345678` | Used when registering commands |
| `GH_APP_ID` | yes | `123456` | GitHub App identifier |
| `GH_APP_PRIVATE_KEY` | yes | `-----BEGIN PRIVATE KEY-----...` | Keep in a secrets manager |
| `GH_INSTALLATION_ID` | yes | `987654321` | Or resolve dynamically |
| `ASANA_ACCESS_TOKEN` | yes | `1/123...` | PAT or OAuth token |
| `ASANA_PROJECT_GID` | yes | `1201234567890123` | Target project |
| `ASANA_SECTION_GID` | yes | `1201234567890456` | “To do” section GID |
| `OPENAI_API_KEY` | yes | `sk-...` | Responses-capable key |

---

## 25) Appendix: Minimal code skeleton

> This README complements the TypeScript skeleton included in the repository and is aligned with Node.js 20+. If you generate the project from a template, ensure the versions and scripts match.

```ts
// src/index.ts
import 'dotenv/config';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import { handleTask } from './modules/handleTask.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, c => console.log(`Logged in as ${c.user.tag}`));

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'task') return;
  await handleTask(interaction);
});

await client.login(process.env.DISCORD_TOKEN);
```

```ts
// src/modules/handleTask.ts
import type { ChatInputCommandInteraction } from 'discord.js';
import { findRepoContext } from '../services/github.js';
import { extractTask } from '../services/openai.js';
import { createAsanaTask } from '../services/asana.js';

export async function handleTask(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const describe = interaction.options.getString('describe', true);
  const projectGid = interaction.options.getString('project') ?? process.env.ASANA_PROJECT_GID!;
  const sectionHint = interaction.options.getString('section') ?? process.env.ASANA_SECTION_GID!;
  const priority = interaction.options.getString('priority') ?? 'p2';

  const repoContext = await findRepoContext(describe); // [{repo,path,url}]
  const task = await extractTask({ describe, priority, repoContext });

  const asanaUrl = await createAsanaTask({
    name: task.title,
    notes: task.body,
    projectGid,
    sectionRef: sectionHint
  });

  await interaction.editReply(`Created: ${asanaUrl}`);
}
```

```ts
// src/services/github.ts
import { Octokit } from '@octokit/rest';

const githubAuthToken =
  process.env.GH_INSTALLATION_TOKEN ??
  process.env.GH_TOKEN ??
  process.env.GITHUB_TOKEN;

const octokit = new Octokit(githubAuthToken ? { auth: githubAuthToken } : {});

export async function findRepoContext(query: string) {
  const q = [`${query}`, `org:your-org`, `in:file`, `language:ts OR language:py`].join(' ');
  const res = await octokit.search.code({ q, per_page: 5 });
  return res.data.items.map(i => ({ repo: i.repository.full_name, path: i.path, url: i.html_url }));
}
```

```ts
// src/services/openai.ts
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function extractTask(input: {
  describe: string; priority: string;
  repoContext: Array<{ repo: string; path: string; url: string }>
}) {
  const schema = {
    name: "task_payload",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        labels: { type: "array", items: { type: "string" } }
      },
      required: ["title", "body"]
    },
    strict: true
  } as const;

  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: "Return a concise task derived from the user text. Use provided repo links as references only." },
      { role: "user", content: `Text: ${input.describe}\nPriority: ${input.priority}\nContext:\n${input.repoContext.map(r => r.url).join('\n')}` }
    ],
    response_format: { type: "json_schema", json_schema: schema }
  });

  const json = JSON.parse(resp.output_text!);
  return json as { title: string; body: string; labels?: string[] };
}
```

```ts
// src/services/asana.ts
import asana from 'asana';
const client = asana.Client.create().useAccessToken(process.env.ASANA_ACCESS_TOKEN!);

export async function createAsanaTask(params: {
  name: string; notes: string; projectGid: string; sectionRef: string;
}) {
  const task = await client.tasks.createTask({
    name: params.name,
    notes: params.notes,
    projects: [params.projectGid],
    memberships: [{ project: params.projectGid, section: params.sectionRef }]
  });
  return `https://app.asana.com/0/${params.projectGid}/${task.gid}`;
}
```

---
