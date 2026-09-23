/**
 * Worker process for processing analysis jobs.
 * Run this alongside the Next.js server: `npm run worker` (production) or `npm run worker:dev`.
 */
// Must be imported first so env vars are available when other modules initialise
import '@/lib/load-env';
import { prisma } from '@/lib/db';
import { closeWorkers, startWorkers } from '@/lib/queue/workers';

console.log('Starting worker process...');

const workers = startWorkers();

console.log('Worker process started successfully');
console.log('Processing jobs from queues:');
workers.forEach(worker => console.log(`  - ${worker.name}`));

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received, shutting down gracefully...`);
  try {
    await closeWorkers();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
