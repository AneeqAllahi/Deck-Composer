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
- **RAG Pipeline**: PostgreSQL full-text search (tsvector/tsquery) over past deck corpus
- **Corpus Ingestion**: Upload PDF/PPTX → extract text → chunk → store in corpus_chunks
- **Slide Editor**: Inline editing, single slide regeneration with optional instruction
- **PPTX Export**: pptxgenjs generates brand-styled presentations
- **Brand Configuration**: Colors, fonts, logo (via object storage), content density

## Pages

- `/` — Deck library with stats dashboard
- `/generate` — New deck wizard form
- `/corpus` — RAG corpus manager (upload/list/delete)
- `/brand` — Brand profile configuration
- `/decks/:id` — Slide editor/viewer

## API Routes

All routes are prefixed with `/api/`:

- `GET /api/healthz` — Health check
- `GET /api/brand-profile` — Get brand profile
- `PUT /api/brand-profile` — Update brand profile
- `GET /api/decks` — List deck summaries
- `POST /api/decks/generate` — Generate a new deck with AI
- `GET /api/decks/stats` — Get stats (totalDecks, totalCorpusDocuments, etc.)
- `GET /api/decks/:id` — Get full deck with slides
- `DELETE /api/decks/:id` — Delete a deck
- `PUT /api/decks/:id/slides/:slideIndex` — Update a slide
- `POST /api/decks/:id/slides/:slideIndex/regenerate` — Regenerate a slide with AI
- `GET /api/decks/:id/export` — Export deck to PPTX (binary download)
- `GET /api/corpus` — List corpus documents
- `POST /api/corpus/upload` — Upload PDF/PPTX (multipart/form-data)
- `DELETE /api/corpus/:id` — Delete corpus document
- `POST /api/storage/uploads/request-url` — Get presigned URL for logo upload
- `GET /api/storage/public-objects/*` — Serve public assets
- `GET /api/storage/objects/*` — Serve private objects

## Database Schema

- `brand_profile` — Single row (id="default") with brand colors/fonts/density/logo
- `decks` — Generated decks with slides stored as JSONB
- `corpus_documents` — Metadata about uploaded documents
- `corpus_chunks` — Text chunks with full-text search tsvector support

## Slide Layout Types

Six layout types: `title`, `section`, `text`, `columns`, `quote`, `metrics`

## Key Technical Notes

- RAG uses PostgreSQL full-text search (tsvector/tsquery), NOT vector embeddings
- PPTX corpus ingestion: adm-zip unzips PPTX → fast-xml-parser extracts slide text
- Export: pptxgenjs; supports all 6 layout types with brand styling
- PPTX export endpoint returns binary — frontend uses `<a href="/api/decks/${id}/export" download>`
- Corpus upload is async (processing happens in background after API responds)
- OpenAI model: gpt-5.2, max_completion_tokens: 8192

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
