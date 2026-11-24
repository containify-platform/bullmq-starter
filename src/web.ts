import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createQueue } from "./queue.js";

// The web app: enqueues jobs and reports on them. The worker app
// (src/worker.ts) processes them; the two share only Valkey.

const queue = createQueue();

function send(res: ServerResponse, status: number, body: unknown) {
	const text = typeof body === "string" ? body : JSON.stringify(body);
	res.writeHead(status, { "content-type": typeof body === "string" ? "text/plain" : "application/json" });
	res.end(text);
}

async function readJson(req: IncomingMessage): Promise<any> {
	let raw = "";
	for await (const chunk of req) {
		raw += chunk;
		if (raw.length > 100_000) throw new Error("too large");
	}
	return raw ? JSON.parse(raw) : {};
}

async function handle(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? "/", "http://localhost");

	// The health check: answers as long as the server is up.
	if (req.method === "GET" && url.pathname === "/health") return send(res, 200, "ok");

	if (req.method === "GET" && url.pathname === "/") {
		return send(res, 200, {
			name: "bullmq-starter",
			queue: queue.name,
			counts: await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
			routes: ["GET /health", "POST /jobs", "GET /jobs/:id"],
		});
	}

	if (req.method === "POST" && url.pathname === "/jobs") {
		const input = await readJson(req).catch(() => null);
		const text = typeof input?.text === "string" ? input.text : "";
		if (!text.trim()) return send(res, 400, { error: 'send {"text": "..."}' });
		const job = await queue.add("count", { text });
		return send(res, 202, { id: job.id, status: `/jobs/${job.id}` });
	}

	const match = url.pathname.match(/^\/jobs\/([^/]+)$/);
	if (req.method === "GET" && match) {
		const job = await queue.getJob(decodeURIComponent(match[1]!));
		if (!job) return send(res, 404, { error: "no such job" });
		return send(res, 200, {
			id: job.id,
			state: await job.getState(),
			progress: job.progress,
			attempts: job.attemptsMade,
			result: job.returnvalue ?? null,
			failedReason: job.failedReason ?? null,
		});
	}

	send(res, 404, { error: "not found" });
}

const server = createServer((req, res) => {
	handle(req, res).catch((err) => {
		console.error(err);
		if (!res.headersSent) send(res, 500, { error: "Internal Server Error" });
		else res.end();
	});
});

// Containify sets HOST=:: (IPv6 and IPv4). PORT is set by the template.
const host = process.env.HOST ?? "::";
const port = Number(process.env.PORT ?? 3000);
server.listen(port, host, () => console.log(`Listening on [${host}]:${port}`));

// A deploy stops the old replica with SIGTERM: finish requests in flight, then exit.
process.on("SIGTERM", () => {
	server.close(async () => {
		await queue.close();
		process.exit(0);
	});
	setTimeout(() => process.exit(0), 10_000).unref();
});
