// The production image's entry point: adapter-node's server, started after
// dropping a blank ORIGIN. Until the server's hostname is configured, the
// Quadlet's EnvironmentFile may carry `ORIGIN=`, which Dashboard treats as
// unset but adapter-node refuses to start with ("Invalid ORIGIN").
if (process.env.ORIGIN?.trim() === '') delete process.env.ORIGIN;

await import('./build/index.js');
