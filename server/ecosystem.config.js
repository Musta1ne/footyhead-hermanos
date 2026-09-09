// Opcional para PM2. Las salas en memoria necesitan una única instancia.
module.exports = {
  apps: [{
    name: "footyhead", script: "build/index.js", instances: 1,
    exec_mode: "fork", env_production: { NODE_ENV: "production" },
  }],
};
