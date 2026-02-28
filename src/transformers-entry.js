// Entry point for bundling Transformers.js into a single local file.
// This file is used only during the build step — not loaded directly by the extension.
// Run: npm install && npm run build
export { pipeline, env } from '@huggingface/transformers';
