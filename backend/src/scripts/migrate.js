/**
 * Applies database/schema.sql to the target MySQL server.
 *
 * Usage:
 *   npm run db:migrate
 *
 * Behavior:
 *   1. Connects to the MySQL server (no database selected).
 *   2. Creates the target database if it does not already exist.
 *   3. Opens a fresh connection against that database with
 *      multipleStatements enabled and runs the full schema file.
 *
 * This script is idempotent for a fresh database only: schema.sql
 * starts with DROP TABLE IF EXISTS for a clean (re)provision. Do NOT
 * run this against a production database that already has real data -
 * it will drop and recreate every table.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error('DB_HOST, DB_USER, and DB_NAME must be set (see .env.example).');
  }

  console.log(`Connecting to MySQL server at ${DB_HOST}:${DB_PORT || 3306} as ${DB_USER}...`);
  const adminConnection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log(`Ensuring database "${DB_NAME}" exists...`);
  await adminConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await adminConnection.end();

  const dbConnection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD || '',
    database: DB_NAME,
    multipleStatements: true,
  });

  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  console.log(`Applying schema from ${schemaPath}...`);
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await dbConnection.query(schemaSql);
  console.log('Schema applied successfully.');
   const seedPath = path.join(__dirname, '../../database/seed.sql');
  if (process.argv.includes('--seed') && fs.existsSync(seedPath)) {
    console.log('Applying baseline seed data...');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await dbConnection.query(seedSql);
    console.log('Seed data applied successfully.');
  }

  await dbConnection.end();
  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
