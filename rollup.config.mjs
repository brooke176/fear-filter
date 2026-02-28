import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/transformers-entry.js',
  output: {
    file: 'transformers.bundle.js',
    format: 'esm',
    // Inline any dynamic imports so the output is a single self-contained file
    inlineDynamicImports: true,
  },
  plugins: [
    resolve({ browser: true }),
  ],
};
