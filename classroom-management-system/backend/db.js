const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "classroom_management",
  password: "Uplift99",
  port: 5432,
});

module.exports = pool;