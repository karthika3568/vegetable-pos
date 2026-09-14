require('dotenv').config();

const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  });

  try {
    await connection.query(`
      ALTER TABLE products
      MODIFY unit ENUM('kg','gram','piece','bunch','box')
      NOT NULL DEFAULT 'kg'
    `);

    await connection.query(`
      ALTER TABLE products
      ADD COLUMN sale_type ENUM('weight','quantity')
      NOT NULL DEFAULT 'weight'
      AFTER unit
    `);

    console.log('Product Phase 4 schema updated successfully');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('sale_type column already exists');
    } else {
      throw error;
    }
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});