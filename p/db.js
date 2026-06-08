const oracledb = require('oracledb');
require('dotenv').config();

// Convert Oracle CLOBs to strings automatically when fetching rows.
oracledb.fetchAsString = [oracledb.CLOB];

// Ensure thin mode is explicitly configured (default in v6+, but setting it explicitly is a good practice)
// In v6+ it's pure JS thin mode unless initOracleClient is called. We do not call initOracleClient.

let pool;

async function initialize() {
  const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1
  };
  
  pool = await oracledb.createPool(dbConfig);
}

async function close() {
  if (pool) {
    await pool.close();
  }
}

/**
 * Execute a SQL statement on the Oracle Database.
 * @param {string} sql - SQL query/statement.
 * @param {object|array} binds - Bind parameters for the SQL.
 * @param {object} options - Execution options.
 */
async function execute(sql, binds = {}, options = {}) {
  let conn;
  // Format rows as Objects instead of Arrays
  options.outFormat = oracledb.OUT_FORMAT_OBJECT;
  // Automatically commit transactions for simplicity in REST routes
  options.autoCommit = true;

  try {
    conn = await pool.getConnection();
    const result = await conn.execute(sql, binds, options);
    return result;
  } catch (err) {
    console.error(`Database execute error: ${err.message}`);
    console.error(`SQL attempted: ${sql}`);
    throw err;
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (e) {
        console.error('Error closing database connection:', e);
      }
    }
  }
}

module.exports = {
  initialize,
  close,
  execute
};
