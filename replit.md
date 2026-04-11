# DeckAI

An AI-powered presentation builder for management consultants. Users can generate full decks from a brief, regenerate individual slides, edit slides inline, and export to native .pptx format. The app uses a RAG knowledge base from past decks (PDF/PPTX) and applies brand parameters (colors, fonts, logo, density) to generated slides.

## Architecture

This is a pnpm monorepo with the following structure:

```
artifacts/
  api-server/   — Express API backend (Node.js, TypeScript, esbuild)
  deckai/       — React frontend (Vite, shadcn/ui, wouter routing)
lib/
  api-client-react/  — Orval-generated React hooks from OpenAPI spec
  api-zod/           — Zod schemas from OpenAPI spec
  db/                — Drizzle ORM PostgreSQL schema
  object-storage-web/ — Client-side object storage upload hook
  integrations-openai-ai-server/ — OpenAI client (Replit AI integration)
```

## Key Features

- **Deck Generation**: OpenAI GPT-based generation of structured slide decks from a brief
- **Multi-Project Corpus & Branding**: Projects have their own corpus documents and brand identity, selectable at generation time
- **Slide-by-Slide Directives**: Optional per-slide guidance anchored to the slide count for fine-grained generation control
- **RAG Pipeline**: PostgreSQL full-text search (tsvector/tsquery) over past deck corpus, scoped per-project
- **Corpus Ingestion**: Upload PDF/PPTX → extract text → chunk → store in corpus_chunks
- **Slide Editor**: Inline editing, single slide regeneration with optional instruction
- **PPTX Export**: pptxgenjs generates brand-styled presentations
- **Brand Configuration**: Colors, fonts, logo (via object storage), content density

## Pages

- `/` — Deck library with stats dashboard
- `/generate` — New deck wizard form (with project selector + slide-by-slide mode)
- `/projects` — Project management (brand + corpus per project)
- `/corpus` — RAG corpus manager (upload/list/delete, filterable by project)
- `/brand` — Global brand profile configuration
- `/decks/:id` — Slide editor/viewer

## API Routes

All routes are prefixed with `/api/`:

- `GET /api/healthz` — Health check
- `GET /api/brand-profile` — Get brand profile
- `PUT /api/brand-profile` — Update brand profile
- `GET /api/projects` — List all projects
- `POST /api/projects` — Create a project
- `GET /api/projects/:id` — Get a project
- `PUT /api/projects/:id` — Update project brand/name/description
- `DELETE /api/projects/:id` — Delete project (cascades to corpus docs)
- `POST /api/projects/:id/logo` — Set project logo via objectPath
- `GET /api/decks` — List deck summaries
- `POST /api/decks/generate` — Generate a new deck with AI (accepts `projectId`, `slideOutlines`)
- `GET /api/decks/stats` — Get stats (totalDecks, totalCorpusDocuments, etc.)
- `GET /api/decks/:id` — Get full deck with slides
- `DELETE /api/decks/:id` — Delete a deck
- `PUT /api/decks/:id/slides/:slideIndex` — Update a slide
- `POST /api/decks/:id/slides/:slideIndex/regenerate` — Regenerate a slide with AI
- `GET /api/decks/:id/export` — Export deck to PPTX (binary download)
- `GET /api/corpus` — List corpus documents (optional `?projectId` filter)
- `POST /api/corpus/upload` — Upload PDF/PPTX (multipart/form-data, optional `projectId`)
- `DELETE /api/corpus/:id` — Delete corpus document
- `POST /api/storage/uploads/request-url` — Get presigned URL for logo upload
- `GET /api/storage/public-objects/*` — Serve public assets
- `GET /api/storage/objects/*` — Serve private objects

## Database Schema

- `brand_profile` — Single row (id="default") with brand colors/fonts/density/logo
- `projects` — Per-client projects with own brand settings (colors, fonts, logo, density)
- `decks` — Generated decks with slides stored as JSONB, optional `project_id`
- `corpus_documents` — Metadata about uploaded documents, optional `project_id`
- `corpus_chunks` — Text chunks with full-text search tsvector support

## Slide Layout Types

Six layout types: `title`, `section`, `text`, `columns`, `quote`, `metrics`

## Key Technical Notes

- RAG uses pgvector for semantic similarity search with fallback to ILIKE text search
- pgvector extension must be enabled in PostgreSQL before schema push
- Embeddings API uses the Replit AI integrations base URL; falls back gracefully if unavailable
- PPTX corpus ingestion: adm-zip unzips PPTX → fast-xml-parser extracts slide text
- Export: pptxgenjs; supports all 6 layout types with brand styling
- PPTX export endpoint returns binary — frontend uses `<a href="/api/decks/${id}/export" download>`
- Corpus upload is async (processing happens in background after API responds)
- OpenAI model: gpt-5.2, max_completion_tokens: 8192
- AI integration: Replit OpenAI AI integration (AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection (Replit-provisioned)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit AI integration proxy base URL
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI integration proxy key
- `GCS_BUCKET` / Google credentials — For object storage (logo upload)

## Running the App

```bash
pnpm install
# Enable pgvector (once): CREATE EXTENSION IF NOT EXISTS vector;
pnpm --filter @workspace/db run push
# Workflow: PORT=8080 api-server dev & PORT=22135 deckai dev
```

## Dependencies

### Backend
- express, pino, pino-http, cors
- drizzle-orm (PostgreSQL via pg)
- openai (via Replit AI integration)
- pptxgenjs (PPTX export)
- pdf-parse, adm-zip, fast-xml-parser (corpus ingestion)
- multer (file upload middleware)
- @google-cloud/storage (object storage)

### Frontend
- react, vite, typescript
- shadcn/ui components
- @tanstack/react-query
- wouter (routing)
- react-hook-form + zod + @hookform/resolvers
- lucide-react icons
- date-fns
