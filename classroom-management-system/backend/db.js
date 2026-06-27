const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 10000, // fail fast instead of hanging forever
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
});

module.exports = pool;
