const path = require("node:path");

const channelsDir = __dirname;
const backendDir = path.resolve(__dirname, "../katechon-backend");

module.exports = {
  apps: [
    {
      name: "katechon-backend-api",
      cwd: backendDir,
      script: "dist/index.js",
      interpreter: "node",
      node_args: "--env-file=.env",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      time: true,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "katechon-agent-worker",
      cwd: backendDir,
      script: "dist/agent-worker.js",
      interpreter: "node",
      node_args: "--env-file=.env",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      time: true,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "katechon-channels-web",
      cwd: channelsDir,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
