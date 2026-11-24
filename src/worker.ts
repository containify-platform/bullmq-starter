import { Worker } from "bullmq";
import { connect, QUEUE_NAME, type WordCountJob, type WordCountResult } from "./queue.js";

// The worker app: no endpoints, it only takes jobs off the queue. Run as many
// replicas as you like; BullMQ hands each job to exactly one of them.

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

const worker = new Worker<WordCountJob, WordCountResult>(
	QUEUE_NAME,
	async (job) => {
		const words = job.data.text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
		const counts = new Map<string, number>();
		for (const [i, word] of words.entries()) {
			counts.set(word, (counts.get(word) ?? 0) + 1);
			if (i % 1000 === 0) await job.updateProgress(Math.round((i / words.length) * 100));
		}
		// Stand-in for real work (an API call, an image resize, an email).
		await new Promise((r) => setTimeout(r, 500));
		await job.updateProgress(100);
		return {
			words: words.length,
			characters: job.data.text.length,
			top: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5),
		};
	},
	{ connection: connect(), concurrency },
);

worker.on("ready", () => console.log(`Worker ready: queue ${QUEUE_NAME}, concurrency ${concurrency}`));
worker.on("completed", (job) => console.log(`job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`job ${job?.id} failed: ${err.message}`));
worker.on("error", (err) => console.error(err));

// A deploy stops the old replica with SIGTERM: let active jobs finish, then
// exit. Jobs it didn't pick up stay queued for the new replica.
process.on("SIGTERM", async () => {
	await worker.close();
	process.exit(0);
});
