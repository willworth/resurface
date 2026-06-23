#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

function resolveDbPath() {
  const fromEnv = process.env.RESURFACE_SQLITE_PATH
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv.trim())
  }

  return path.join(process.cwd(), '.resurface', 'resurface.db')
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z')
}

const dbPath = resolveDbPath()

if (!fs.existsSync(dbPath)) {
  console.error(`Resurface database not found: ${dbPath}`)
  console.error('Set RESURFACE_SQLITE_PATH if the canonical database lives elsewhere.')
  process.exit(1)
}

const stat = fs.statSync(dbPath)
if (!stat.isFile()) {
  console.error(`Resurface database path is not a file: ${dbPath}`)
  process.exit(1)
}

const backupDir =
  process.env.RESURFACE_BACKUP_DIR?.trim() ||
  path.join(path.dirname(dbPath), 'backups')

fs.mkdirSync(backupDir, { recursive: true })

const parsed = path.parse(dbPath)
const backupPath = path.join(
  backupDir,
  `${parsed.name}-${timestamp()}${parsed.ext || '.db'}`
)

fs.copyFileSync(dbPath, backupPath, fs.constants.COPYFILE_EXCL)

console.log(`Backed up ${dbPath}`)
console.log(`       to ${backupPath}`)
