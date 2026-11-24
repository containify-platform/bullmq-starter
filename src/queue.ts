import { Queue } from "bullmq";
import { Redis } from "ioredis";

// REDIS_URL comes from the Valkey app: {{ "Valkey".REDIS_URL }}. Plain
// redis://, no TLS: the private network doesn't use it.
const url = process.env.REDIS_URL ?? "redis://localhost:6379";

/** A connection BullMQ can share; workers need maxRetriesPerRequest null. */
export function connect() {
	// family 0: look up IPv6 and IPv4. Containify's private network is IPv6.
	return new Redis(url, { family: 0, maxRetriesPerRequest: null });
}

export const QUEUE_NAME = "word-count";

/** What the web app enqueues and the worker processes. */
export interface WordCountJob {
	text: string;
}

export interface WordCountResult {
	words: number;
	characters: number;
	top: [string, number][];
}

export function createQueue() {
	return new Queue<WordCountJob, WordCountResult>(QUEUE_NAME, {
		connection: connect(),
		defaultJobOptions: {
			attempts: 3,
			backoff: { type: "exponential", delay: 1000 },
			removeOnComplete: { age: 24 * 3600, count: 1000 },
			removeOnFail: { age: 7 * 24 * 3600 },
		},
	});
}
