import { resolve } from 'node:path'

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
} catch {
  // no .env: rely on the real environment
}

const databaseURL = process.env.DATABASE_URL
if (!databaseURL) throw new Error('DATABASE_URL is missing (set it in .env)')

export const config = { database: { databaseURL } }
