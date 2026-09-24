# Mirialis

Software con cui un'azienda organizza la partecipazione a una fiera B2B: definisce lo stand, chiede preventivi agli allestitori
(outbound via Smartlead) e gestisce risposte e preventivi da una dashboard.

- Decisioni tecniche: `docs/DECISIONI.md` · Stato e prove: `STATUS.md`
- Stack: Next.js 15 · Drizzle + Neon Postgres · Zod · Vitest + PGlite · Vercel · n8n · Smartlead (Basic) · OpenAI

```bash
npm install
cp .env.example .env.local   # compila i valori
npm test                     # test su Postgres in memoria (PGlite) con le migrazioni reali
npm run dev
```

Migrazioni: `npm run db:generate` dopo aver modificato `src/db/schema.ts`, poi `npm run db:migrate` (serve accesso a Neon).
