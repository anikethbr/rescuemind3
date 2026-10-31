module.exports = {
  apps: [{
    name: "rescuemind",
    cwd: __dirname,
    script: "server.js",
    interpreter: "node",
    instances: 1,
    autorestart: true,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      PORT: process.env.PORT || "8000",
    },
  }],
};
