// npm test is the fast tier (under 30s). npm run test:full sets MARGENT_TIER=full and runs every test.
// Pass `full` as a test's options to keep it out of the fast tier: there it shows as skipped, with the command that runs it.
export const full = process.env.MARGENT_TIER === 'full' ? {} : { skip: 'full tier: npm run test:full' };
