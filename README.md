# CMS Assets Service

The Assets service handles all file storage for the CMS platform. When an author uploads an image, video, or document to a content entry, it goes through this service. The service stores the file in MinIO (S3-compatible object storage), records the asset metadata in MongoDB, and publishes a `files.uploaded` Kafka event so the Content service can attach the URL to the entry automatically.

It is one of four backend services in the platform:

| Service | Repo | Responsibility |
|---|---|---|
| **Auth** (`cmsUserManagment`) | `../auth` | User accounts, login, JWT issuance, 2FA |
| **Organisations** (`cmsOrg`) | `../organisations` | Orgs, membership, roles, API key lifecycle |
| **Content** (`cmsContentManagement`) | `../content` | Entry authoring, search, public delivery |
| **Assets** | this repo | S3 file uploads, asset metadata, Kafka event publishing |

---

## Why this service exists

File uploads are kept separate from the Content service for two reasons. First, binary uploads have different scaling needs than JSON CRUD — they are large, can be slow, and benefit from being handled by a service that can be scaled independently. Second, uploaded files need to be tracked per organisation and per content entry, which is a separate concern from managing the content itself.

The Content service never handles binary data directly. Instead, the author uploads through Assets, and Assets tells Content about the file via Kafka. This keeps both services focused and the coupling event-driven rather than synchronous.

---

## How the upload flow works

```
Author (Browser)                Assets Service              MinIO              Kafka        Content Service
     |                               |                        |                  |                |
     | POST /organisations/:orgId/assets                      |                  |                |
     |   Authorization: Bearer <JWT>                          |                  |                |
     |   Body: { entryId, file }                              |                  |                |
     |-----------------------------→ |                        |                  |                |
     |                               |-- role check ------→ cmsOrg              |                |
     |                               |←-- "Editor" --------|                    |                |
     |                               |                        |                  |                |
     |                               |-- putObject ----------→|                  |                |
     |                               |←-- stored ------------|                  |                |
     |                               |                        |                  |                |
     |                               |-- save metadata to MongoDB               |                |
     |                               |                        |                  |                |
     |                               |-- publishFileUploaded ------------------→|                |
     |                               |                        |                  |-- consume →    |
     |                               |                        |                  |   UpdateAssetUrl
     |                               |                        |                  |   re-evaluate status
     |←-- { key, url } -------------|                        |                  |                |
```

The author gets the public URL immediately in the response. The Content service processes the Kafka event asynchronously and writes the URL back to the entry, potentially auto-publishing it if all required fields are now complete.

---

## Architecture

The service is a NestJS 11 application structured as feature modules:

```
src/
  app.module.ts              — root module, wires everything together
  main.ts                    — bootstrap, CORS, Swagger
  auth/                      — JWT strategy and guard
  assets/                    — primary asset CRUD (AssetsController, AssetsService)
  organisations/             — org-scoped upload controller, MongoDB schema
  storage/                   — MinIO client wrapper (StorageService)
  kafka/                     — Kafka producer (KafkaService)
  database/                  — MongoDB connection module
  file/                      — anonymous file streaming endpoint
  users/                     — personal (non-org) file upload
```

---

## Storage

### MinIO (S3-compatible object storage)

All files are stored in MinIO under a single configurable bucket (default: `uploads`). On startup, the service checks whether the bucket exists and creates it if not. It then applies a public read policy to the bucket so that asset URLs can be accessed without signed headers.

**S3 key patterns — every key encodes its scope:**

| Upload type | Key format |
|---|---|
| Org content asset | `orgs/{orgId}/{entryId}/{timestamp}-{filename}` |
| User personal file | `{userId}/{timestamp}-{filename}` |
| User profile asset | `profiles/{userId}/{timestamp}-{filename}` |

Filenames are sanitised before use — slashes, backslashes, and spaces are replaced with underscores.

**Public URL format:**
```
{MINIO_PUBLIC_URL}/{MINIO_BUCKET}/{url-encoded-key}
```

Each path segment in the key is individually URL-encoded so that filenames with special characters don't break the URL.

### MongoDB (asset metadata)

Asset metadata is stored per organisation as an embedded document array in a single `organisations` collection. This avoids joins and keeps all of an org's assets in one document.

**Collection: `organisations`**

| Field | Type | Notes |
|---|---|---|
| `orgId` | `string` | Unique, indexed — matches the `OrganisationId` GUID from cmsOrg |
| `assets` | `Asset[]` | Embedded array of all org assets |
| `createdAt` | `Date` | Mongoose `timestamps: true` |
| `updatedAt` | `Date` | Mongoose `timestamps: true` |

**Embedded asset document:**

| Field | Type | Notes |
|---|---|---|
| `_id` | `ObjectId` | Auto-generated by Mongoose |
| `entryId` | `string` | The content entry this asset belongs to; indexed |
| `key` | `string` | Full S3 key — unique identifier for the file |
| `url` | `string` | Public access URL |
| `originalname` | `string` | Original filename from the upload |
| `mimetype` | `string?` | MIME type if provided by the browser |
| `size` | `number?` | File size in bytes |
| `tags` | `Record<string, string>` | Key-value metadata (e.g. `{ title: "Hero Image" }`) |

An org document is created automatically (`upsert: true`) on first upload. Assets are pushed into the embedded array and are never moved to a separate collection.

### Redis (cache)

List and info responses are cached in Redis with a 5-minute TTL. Cache failures (read or write) are caught and logged — they never fail a request.

**Cache key patterns:**

| Key | What it caches |
|---|---|
| `assets:list:{orgId}:{page}:{limit}:g{gen}` | Paginated list of all org assets |
| `assets:list:{orgId}:{entryId}:{page}:{limit}:g{gen}` | Paginated list filtered by entry |
| `assets:info:{key}` | Single asset lookup by S3 key |
| `assets:list:gen:{orgId}` | Generation counter for org-level list |
| `assets:list:gen:{orgId}:{entryId}` | Generation counter for entry-level list |

**Generation-based invalidation:** Instead of deleting individual list cache keys (which is impossible without scanning all pages), the service bumps a generation counter stored in Redis whenever the asset list changes (upload, delete, metadata update). The generation is embedded in the cache key, so all previous keys become unreachable instantly without explicit deletion. Generation counters are stored for 24× TTL (120 minutes) to outlive any cached value.

The `assets:info:{key}` entry is invalidated explicitly on metadata update and delete.

---

## Authentication and access control

### JWT validation

Every request except `GET /uploads/*` requires a valid `Authorization: Bearer <token>` header. The JWT is validated locally using `passport-jwt` (HS256, issuer + audience + expiry checked) against the same secret the Auth service uses to issue tokens.

### Organisation role check

For org-scoped routes, after JWT validation, the service calls `GET /organisations/{orgId}/role` on cmsOrg (configured via `CMSORG_BASE_URL`) to fetch the user's role in that org. This happens synchronously during the request — if cmsOrg is unreachable the request is rejected with 403.

**Access levels enforced by `AssetAccessGuard`:**

| Operation | Required roles |
|---|---|
| `read` (list, info) | Viewer, Editor, Admin |
| `write` (upload, update metadata) | Editor, Admin |
| `delete` | Admin only |

The required access level is declared per handler with the `@AssetAccess('read' | 'write' | 'delete')` decorator.

The legacy `POST /organisations/:orgId/upload` route uses a simpler `OrgAccessGuard` that only checks for Editor or Admin — it is equivalent to `write` access.

---

## Kafka

The service produces to a single topic (configured via `KAFKA_TOPIC`, default: `files.uploaded`). A message is published on every successful upload — both org-scoped and user-scoped.

**Event payload:**

```json
{
  "entryId": "<uuid | empty string for user uploads>",
  "assetId": "<s3-key>",
  "key": "<s3-key>",
  "originalname": "<original filename>",
  "uploadedAt": "<ISO 8601 datetime>",
  "url": "<public url>"
}
```

For user personal uploads (not linked to a content entry), `entryId` is an empty string. The Content service ignores events where the `entryId` is empty or doesn't match a known entry.

The Kafka producer connects on module init with a 5-second connection timeout and 5 retries (initial delay 300 ms). If the producer is unavailable, the error is logged and the upload response is still returned to the caller — the Kafka publish is best-effort.

---

## API reference

All routes require `Authorization: Bearer <JWT>` unless marked **anonymous**.

### Asset management (`/organisations/:orgId/assets`)

| Method | Path | Access level | Description |
|---|---|---|---|
| `POST` | `/organisations/:orgId/assets` | write | Upload a file. Multipart form with `entryId` (string) and `file` (binary). Stores metadata in MongoDB, publishes Kafka event. Returns `{ entryId, assetId, key, url }` |
| `GET` | `/organisations/:orgId/assets` | read | List assets. Params: `entryId` (filter by entry, optional), `page` (default 1), `limit` (default 20, max 100). Returns `{ data, total, page, limit, totalPages }` |
| `GET` | `/organisations/:orgId/assets/info?key=` | read | Get metadata for a single asset by its S3 key |
| `PATCH` | `/organisations/:orgId/assets/metadata?key=` | write | Replace the asset's tags. Body: `{ "tags": { "title": "...", "altText": "..." } }` |
| `DELETE` | `/organisations/:orgId/assets?key=` | delete | Remove the asset from MongoDB and delete the file from MinIO |

**Upload response:**
```json
{
  "entryId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "assetId": "orgs/abc/def/1234567890-image.png",
  "key": "orgs/abc/def/1234567890-image.png",
  "url": "http://localhost:9000/uploads/orgs/abc/def/1234567890-image.png"
}
```

---

### Legacy org upload (`/organisations/:orgId/upload`)

| Method | Path | Min role | Description |
|---|---|---|---|
| `POST` | `/organisations/:orgId/upload` | Editor | Upload a file. Does **not** store metadata in MongoDB. Uploads directly to MinIO and publishes Kafka event. Kept for backwards compatibility |

---

### User personal upload (`/users`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/users/upload` | JWT only | Upload a personal file (no org scope, no MongoDB metadata). Key pattern: `{userId}/{timestamp}-{filename}`. Publishes Kafka event with empty `entryId` |

---

### Public file streaming (`/uploads`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/uploads/*` | **anonymous** | Stream a file from MinIO by its path. Content-Type is inferred from file extension. Supported types: jpg, jpeg, png, gif, webp, svg, pdf, mp4, webm. Falls back to `application/octet-stream` |

This endpoint allows uploaded files to be embedded directly in `<img>` or `<video>` tags in the frontend.

---

## Configuration

All settings come from environment variables. Copy `dotenv` to `.env` to configure for local development.

| Variable | Required | Default | Description |
|---|---|---|---|
| `MINIO_ENDPOINT` | Yes | `localhost` | MinIO server hostname |
| `MINIO_PORT` | No | `9000` | MinIO server port |
| `MINIO_ACCESS_KEY` | Yes | — | MinIO access key |
| `MINIO_SECRET_KEY` | Yes | — | MinIO secret key |
| `MINIO_BUCKET` | No | `uploads` | Bucket name (created on startup if missing) |
| `MINIO_PUBLIC_URL` | No | `http://localhost:9000` | Base URL used when building public asset URLs |
| `KAFKA_BROKER` | Yes | — | Kafka broker address (e.g. `kafka:9092`) |
| `KAFKA_TOPIC` | No | `files.uploaded` | Topic to publish upload events to |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `REDIS_HOST` | No | `localhost` | Redis hostname |
| `REDIS_PORT` | No | `6379` | Redis port |
| `CMSORG_BASE_URL` | Yes | `http://localhost:5059` | Base URL of the cmsOrg service for role checks |
| `JWT_SECRET` | Yes | — | HS256 signing key — must match Auth and cmsOrg services |
| `JWT_ISSUER` | No | `cms` | JWT issuer claim |
| `JWT_AUDIENCE` | No | `account` | JWT audience claim |
| `JWT_EXPIRY_MINUTES` | No | `60` | Not used for validation — informational only |
| `PORT` | No | `3000` | HTTP port the service listens on |

---

## Running locally

**Prerequisites:** Docker, Node.js 20+.

```bash
# Install dependencies
npm install

# Start MinIO, Kafka, Zookeeper, MongoDB, and Redis
docker compose up -d

# Run in development mode (watch)
npm run start:dev
```

Swagger UI is available at `http://localhost:3000/api`.

The compose file starts the full infrastructure stack:

| Service | Port |
|---|---|
| App | `3000` |
| MinIO API | `9000` |
| MinIO Console | `9001` |
| MongoDB | `27017` |
| Redis | `6379` |
| Kafka | `29092` (external) / `9092` (internal) |
| Zookeeper | `2181` |

The `CMSORG_BASE_URL` in the compose file points to `host.docker.internal:5059` so that the containerised service can reach the cmsOrg service running on the host. Start the Organisations service first if you need role-checked uploads to work.

---

## Running tests

```bash
# Unit tests
npm run test

# Unit tests in watch mode
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

## CORS

The service allows cross-origin requests from:
- `http://localhost:3000` and any `http://localhost:*` origin
- `https://nest.jonfjz.dev` and any subdomain of `.jonfjz.dev`

All other origins are rejected. Credentials are allowed.
