# NestJS S3 & Kafka Microservice

Një mikroshërbim i specializuar për menaxhimin e skedarëve (Storage) dhe komunikimin asinkron përmes Kafka, i ndërtuar me **NestJS**. Ky shërbim ofron API për ngarkimin e aseteve në S3 (MinIO) dhe shpërndarjen e ngjarjeve në sistemin e gjerë.

## 🚀 Veçoritë

- **Menaxhimi i Skedarëve**: Ngarkimi i sigurt i skedarëve në MinIO (S3 Compatible Storage).
- **Komunikimi Asinkron**: Integrim me **Kafka** për njoftimin e shërbimeve të tjera pas ngarkimit.
- **Gjurmimi i Aseteve**: Ruajtja dhe listimi i aseteve të ngarkuara nga përdoruesit.
- **Siguria**: Autentifikim i plotë përmes **JWT Bearer tokens**.

## 🔐 Autentifikimi

| Lloji          | Header                          | Përdorimi                                     |
| -------------- | ------------------------------- | --------------------------------------------- |
| **JWT Bearer** | `Authorization: Bearer <token>` | Kërkohet për çdo kërkesë (Upload, List, etj.) |

## 📡 Pasqyra e Endpoint-eve

### Skedarët (Files)

_Menaxhimi i ngarkimit fizik të skedarëve._

- `POST /files/upload` - Ngarko një skedar të ri (Multipart/Form-Data).
  - Parametrat: `file`, `entryId`.

### Asetet (Assets)

_Menaxhimi i metadatave të skedarëve të ngarkuar._

- `GET /assets` - Merr listën e aseteve për përdoruesin aktual.
  - Query Params: `page`, `pageSize`.

## 🛠️ Shembuj Përdorimi

### Ngarkimi i një Skedari

```bash
curl -X POST "http://localhost:3000/files/upload" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: multipart/form-data" \
     -F "file=@/path/to/image.png" \
     -F "entryId=12345"
```

### Listimi i Aseteve

```bash
curl -X GET "http://localhost:3000/assets?page=1&pageSize=10" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🏗️ Zhvillimi

### Lokal

1. Starto shërbimet (MinIO & Kafka):
   ```bash
   docker compose up -d
   ```
2. Ekzekuto aplikacionin:
   ```bash
   npm run start:dev
   ```

### Kontrolli i Cilësisë (Linting & Formatting)

```bash
# Kontrollo për gabime (Lint)
npm run lint

# Formato kodin (Prettier)
npm run format
```

---

## ✅ Përputhshmëria me Kërkesat Teknike

Ky projekt është zhvilluar në përputhje me dokumentin "Kërkesat teknike të Projektit" dhe përmbush këto aspekte kyçe:

### 1. Arkitektura e Sistemit

- **Mikroshërbime**: Projekti funksionon si një mikroshërbim i pavarur për **Storage**, i izoluar nga logika e biznesit kryesor.
- **RESTful API**: Përdor standardet HTTP dhe JSON (`POST /files`, `GET /assets`).
- **Modelet e Komunikimit**:
  - **Sinkron**: HTTP REST për ngarkim dhe rikthim të të dhënave.
  - **Asinkron**: **Kafka** (Message Queue) për njoftimin e sistemeve të tjera pas ngarkimit të skedarëve.
- **Stateless**: Mbështetet plotësisht në `JWT` dhe nuk ruan gjendje sesioni në server.

### 2. Siguria

- **Autentifikimi (AuthN)**: Implementim i **JWT (JSON Web Token)** përmes `Passport` dhe `JwtStrategy`.
- **Mbrojtja**: Përdorimi i `Guards` (`JwtAuthGuard`) për të mbrojtur endpoint-et nga qasja e paautorizuar.

### 3. Performanca dhe Shkallëzueshmëria

- **Asynchronous Processing**: Përdorimi i **Kafka** për të përpunuar ngjarjet në sfond, duke mos bllokuar kërkesat e përdoruesit.

### 4. Dokumentimi i API-ve

- **OpenAPI 3.0**: Gjenerim automatik i dokumentacionit përmes **Swagger** (`@nestjs/swagger`), i qasshëm për testim interaktiv.

### 7. Integrimi me Sisteme të Jashtme

- **Cloud Storage**: Integrim me **MinIO** si një zgjidhje S3-compatible object storage.
- **Message Broker**: Përdorimi i **Kafka** për integrim me mikroshërbimet e tjera.

### 8. Standardet e Kodimit

- **Parimet**: Respektimi i **SOLID** dhe **Clean Architecture** falë strukturës modulare të NestJS.
- **Linting & Formatting**: Përdorimi i **ESLint** dhe **Prettier** për cilësi dhe konsistencë kodi.
- **Testimi**: Përfshirja e testeve të njësive (Unit Tests) dhe End-to-End (E2E) me **Jest**.

### 9. Platforma dhe Teknologjitë

- **Backend**: Zhvilluar me **Node.js** dhe framework-un **NestJS**.
- **Kontejnerizimi**: Përdorimi i **Docker** për paketimin e aplikacionit dhe varësive të tij.

### 10. DevOps dhe Shpërndarja

- **Docker Containers**: Përdorimi i **Docker Compose** për orkestrimin lokal të aplikacionit, MinIO dhe Kafka.
