#!/usr/bin/env node

/**
 * Worker process for processing analysis jobs
 * Run this in production alongside the Next.js server
 */

require('ts-node/register');

console.log('Starting worker process...');

// Import workers to start them
require('../src/lib/queue/workers');

console.log('Worker process started successfully');
console.log('Processing jobs from queues:');
console.log('  - analyze-comment');
console.log('  - analyze-repository');

// Keep process alive
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
