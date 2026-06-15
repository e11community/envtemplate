/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // The root tsconfig uses moduleResolution: "bundler" (for the esbuild action build).
  // ts-jest emits CommonJS for jest, which is incompatible with "bundler" and would fall
  // back to the deprecated node10 resolution under TS6. Override to node-style resolution
  // for the test transform only — leaving the action's tsconfig untouched.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
        },
      },
    ],
  },
}
