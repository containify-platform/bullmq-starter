# BullMQ worker starter

A [BullMQ](https://bullmq.io) job queue on Node.js 24 and [Valkey](https://valkey.io), split into two apps from one repository, ready to deploy on [Containify](https://containify.cloud):

- **Web** (`src/web.ts`): a small HTTP API that enqueues jobs and reports on them
  - `GET /` shows the queue's job counts
  - `GET /health` answers `ok` (the health check)
  - `POST /jobs` with `{"text": "..."}` enqueues a word-count job and returns its id
  - `GET /jobs/:id` shows its state, progress and result
- **Worker** (`src/worker.ts`): takes jobs off the queue and processes them. It has no endpoints. Jobs retry up to 3 times with exponential backoff.

Both share `src/queue.ts` (the queue name, job types and the Valkey connection) and talk only through Valkey.

## Run locally

You need Node.js 22 or newer and Valkey or Redis (`docker run -p 6379:6379 valkey/valkey:9-alpine`).

```bash
npm install
export REDIS_URL=redis://localhost:6379
npm run dev:web      # in one terminal
npm run dev:worker   # in another
curl -X POST localhost:3000/jobs -H 'content-type: application/json' -d '{"text":"to be or not to be"}'
```

## Deploy on Containify

Deploy the **BullMQ worker starter** template from the catalogue (`containify templates deploy bullmq-worker`). It builds this repository once per app with its Dockerfile and adds:

- **Web**: the API, on a public HTTPS endpoint, with `/health` as its health check. Start command `node dist/web.js`.
- **Worker**: the same image with start command `node dist/worker.js`, no endpoints. It autoscales between 1 and 3 replicas on CPU.
- **Valkey**: Valkey 9 with a generated password and its data on a volume, reachable only over the private network. Both apps' `REDIS_URL` references it.

To make it yours, fork this repository, point both apps' source at your fork, and replace the word-count job with your own.

## Notes

- Containify sets `HOST=::` on every app; the web server listens there (IPv6 and IPv4). The template sets `PORT=3000`.
- The private network is IPv6, so the ioredis connection uses `family: 0` (IPv6 and IPv4 lookups). Workers need `maxRetriesPerRequest: null`.
- `WORKER_CONCURRENCY` (default 5) sets how many jobs each worker replica runs at once.
- On `SIGTERM` the worker lets active jobs finish before exiting, and jobs it hadn't picked up stay queued, so deploys don't lose work.

## License

MIT
