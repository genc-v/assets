# CMS File Storage Service

A NestJS microservice for file and asset management. Handles file uploads for users and organisations, stores asset metadata in MongoDB, caches with Redis, and publishes upload events to Kafka.

**Stack:** NestJS · MinIO (S3-compatible) · MongoDB · Redis · Kafka · JWT

---

## What It Does

- Accepts file uploads from authenticated users and organisation members
- Stores files in MinIO under namespaced paths (`{userId}/...` or `orgs/{orgId}/...`)
- Persists asset metadata (key, URL, filename, MIME type, size, tags) in MongoDB
- Serves files publicly via a streaming endpoint
- Publishes a `files.uploaded` Kafka event on every successful upload
- Caches asset list/info responses in Redis (5-minute TTL)
- Enforces role-based access (Admin / Editor / Viewer) by delegating to an external CMS-Org service

---

## Authentication

All endpoints except `GET /uploads/*` require a **JWT Bearer token**.

```
Authorization: Bearer <token>
```

Role checks are performed by querying `{CMSORG_BASE_URL}/organisations/{orgId}/role` with the caller's token.

| Role    | Read | Write | Delete |
|---------|------|-------|--------|
| Admin   | ✓    | ✓     | ✓      |
| Editor  | ✓    | ✓     | ✗      |
| Viewer  | ✓    | ✗     | ✗      |

---

## Endpoints

### File Serving

#### `GET /uploads/*`

Streams a file from MinIO. The wildcard path is the full S3 object key.

| | |
|---|---|
| Auth | None (public) |
| Returns | Binary file stream with appropriate `Content-Type` |

**Errors**

| Status | Reason |
|--------|--------|
| 404 | File not found in MinIO |

---

### User Uploads

#### `POST /users/upload`

Uploads a file to the authenticated user's namespace.

| | |
|---|---|
| Auth | JWT |
| Body | `multipart/form-data` — field `file` (required) |
| Storage path | `{userId}/{timestamp}-{filename}` |

**Response `201`**
```json
{
  "assetId": "user-123/1704067200000-photo.jpg",
  "key":     "user-123/1704067200000-photo.jpg",
  "url":     "http://minio:9000/uploads/user-123/1704067200000-photo.jpg"
}
```

**Side effects:** publishes `files.uploaded` Kafka event.

**Errors**

| Status | Reason |
|--------|--------|
| 400 | Missing file or user ID |
| 401 | Invalid or missing JWT |

---

### Organisation Uploads

#### `POST /organisations/:orgId/upload`

Uploads a file to an organisation namespace. Requires Editor or Admin role.

| | |
|---|---|
| Auth | JWT + OrgAccessGuard (Editor / Admin) |
| Path params | `orgId` |
| Body | `multipart/form-data` — fields `file` (required), `entryId` (required) |
| Storage path | `orgs/{orgId}/{entryId}/{timestamp}-{filename}` |

**Response `201`**
```json
{
  "entryId": "article-789",
  "assetId": "orgs/org-456/article-789/1704067200000-banner.png",
  "key":     "orgs/org-456/article-789/1704067200000-banner.png",
  "url":     "http://minio:9000/uploads/orgs/org-456/article-789/1704067200000-banner.png"
}
```

**Side effects:** publishes `files.uploaded` Kafka event.

**Errors**

| Status | Reason |
|--------|--------|
| 400 | Missing file or entryId |
| 401 | Invalid or missing JWT |
| 403 | Viewer role or CMS-Org service unreachable |

---

### Assets

#### `POST /organisations/:orgId/assets`

Uploads a file **and** creates a persistent asset record in MongoDB.

| | |
|---|---|
| Auth | JWT + AssetAccessGuard (write) |
| Path params | `orgId` |
| Body | `multipart/form-data` — fields `file` (required), `entryId` (required) |

**Response `201`**
```json
{
  "entryId": "article-789",
  "assetId": "orgs/org-456/article-789/1704067200000-banner.png",
  "key":     "orgs/org-456/article-789/1704067200000-banner.png",
  "url":     "http://minio:9000/uploads/orgs/org-456/article-789/1704067200000-banner.png"
}
```

**Side effects:** saves asset to MongoDB, invalidates Redis list cache, publishes Kafka event.

**Errors**

| Status | Reason |
|--------|--------|
| 400 | Missing file or entryId |
| 401 | Invalid or missing JWT |
| 403 | Insufficient role |

---

#### `GET /organisations/:orgId/assets`

Lists assets for an organisation, optionally filtered by `entryId`. Results are cached.

| | |
|---|---|
| Auth | JWT + AssetAccessGuard (read) |
| Path params | `orgId` |
| Query params | `entryId` (optional) |
| Cache | Redis, 5-minute TTL per `orgId` / `entryId` |

**Response `200`**
```json
[
  {
    "id":           "664abc123def456789012345",
    "entryId":      "article-789",
    "key":          "orgs/org-456/article-789/1704067200000-banner.png",
    "url":          "http://minio:9000/uploads/orgs/org-456/article-789/1704067200000-banner.png",
    "originalname": "banner.png",
    "mimetype":     "image/png",
    "size":         204800,
    "tags":         { "title": "Hero Banner", "altText": "A homepage banner" },
    "createdAt":    "2024-01-01T00:00:00.000Z",
    "updatedAt":    "2024-01-01T00:00:00.000Z"
  }
]
```

Returns an empty array if no assets exist.

**Errors**

| Status | Reason |
|--------|--------|
| 401 | Invalid or missing JWT |
| 403 | Insufficient role |

---

#### `GET /organisations/:orgId/assets/info`

Returns metadata for a single asset by its S3 key. Result is cached.

| | |
|---|---|
| Auth | JWT + AssetAccessGuard (read) |
| Path params | `orgId` |
| Query params | `key` (required) — full S3 object key |
| Cache | Redis, 5-minute TTL |

**Response `200`**
```json
{
  "id":           "664abc123def456789012345",
  "entryId":      "article-789",
  "key":          "orgs/org-456/article-789/1704067200000-banner.png",
  "url":          "http://minio:9000/uploads/orgs/org-456/article-789/1704067200000-banner.png",
  "originalname": "banner.png",
  "mimetype":     "image/png",
  "size":         204800,
  "tags":         { "title": "Hero Banner" },
  "createdAt":    "2024-01-01T00:00:00.000Z",
  "updatedAt":    "2024-01-01T00:00:00.000Z"
}
```

**Errors**

| Status | Reason |
|--------|--------|
| 400 | Missing `key` query param |
| 401 | Invalid or missing JWT |
| 403 | Insufficient role |
| 404 | Asset not found |

---

#### `PATCH /organisations/:orgId/assets/metadata`

Updates the key-value tags on an asset.

| | |
|---|---|
| Auth | JWT + AssetAccessGuard (write) |
| Path params | `orgId` |
| Query params | `key` (required) — full S3 object key |
| Body | `application/json` |

**Request body**
```json
{
  "tags": {
    "title":   "Hero Image",
    "altText": "A banner for the homepage"
  }
}
```

**Response `200`**
```json
{
  "key":  "orgs/org-456/article-789/1704067200000-banner.png",
  "tags": { "title": "Hero Image", "altText": "A banner for the homepage" }
}
```

**Side effects:** invalidates Redis cache for this asset and its list.

**Errors**

| Status | Reason |
|--------|--------|
| 400 | Missing `key` or invalid `tags` |
| 401 | Invalid or missing JWT |
| 403 | Viewer role |
| 404 | Asset not found |

---

#### `DELETE /organisations/:orgId/assets`

Permanently deletes an asset from MongoDB and MinIO. Admin only.

| | |
|---|---|
| Auth | JWT + AssetAccessGuard (delete — Admin only) |
| Path params | `orgId` |
| Query params | `key` (required) — full S3 object key |

**Response `200`**
```json
{
  "deleted": "orgs/org-456/article-789/1704067200000-banner.png"
}
```

**Side effects:** removes MongoDB record, deletes MinIO object, invalidates Redis cache.

**Errors**

| Status | Reason |
|--------|--------|
| 400 | Missing `key` |
| 401 | Invalid or missing JWT |
| 403 | Not Admin |
| 404 | Asset not found |

---

## Kafka Events

Every file upload publishes a message to the `files.uploaded` topic (configurable via `KAFKA_TOPIC`).

**Message payload**
```json
{
  "entryId":      "article-789",
  "assetId":      "orgs/org-456/article-789/1704067200000-banner.png",
  "key":          "orgs/org-456/article-789/1704067200000-banner.png",
  "originalname": "banner.png",
  "uploadedAt":   "2024-01-01T00:00:00.000Z",
  "url":          "http://minio:9000/uploads/orgs/org-456/article-789/1704067200000-banner.png"
}
```

`entryId` is an empty string for user uploads.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | — | **Required.** JWT signing secret |
| `JWT_ISSUER` | `cms` | JWT issuer claim |
| `JWT_AUDIENCE` | `account` | JWT audience claim |
| `JWT_EXPIRY_MINUTES` | `60` | Token lifetime in minutes |
| `MINIO_ENDPOINT` | `localhost` | MinIO host |
| `MINIO_PORT` | `9000` | MinIO port |
| `MINIO_ACCESS_KEY` | — | MinIO access key |
| `MINIO_SECRET_KEY` | — | MinIO secret key |
| `MINIO_BUCKET` | `uploads` | Bucket name |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | Base URL for public file links |
| `KAFKA_BROKER` | `localhost:9092` | Kafka broker address |
| `KAFKA_TOPIC` | `files.uploaded` | Topic for upload events |
| `MONGODB_URI` | `mongodb://localhost:27017/cms` | MongoDB connection URI |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `CMSORG_BASE_URL` | `http://localhost:5059` | External CMS-Org service for role checks |
| `PORT` | `3000` | HTTP server port |
