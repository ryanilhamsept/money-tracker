// Vercel serverless entry point. The Express app doubles as a request
// handler, so it is exported as-is -- no listen() in this environment.
module.exports = require("../src/app");
