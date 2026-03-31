import "dotenv/config";

/** @type {import('knex').Knex.Config} */
const config = {
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("supabase.co")
      ? { rejectUnauthorized: false }
      : false,
  },
  migrations: {
    directory: "./migrations",
    extension: "js",
  },
};

export default config;
