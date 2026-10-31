module.exports = {
  apps: [{
    name: "rescuemind",
    cwd: __dirname,
    script: "./.venv/bin/uvicorn",
    args: "app.main:app --host 127.0.0.1 --port 8000 --workers 1",
    interpreter: "none",
    instances: 1,
    autorestart: true,
    max_memory_restart: "500M",
    env: {
      PYTHONUNBUFFERED: "1",
      PORT: "8000",
    },
  }],
};
