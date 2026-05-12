/**
 * Clears all leaderboard rows in harvestit.db (same DB as server.js).
 * Stop the server first if you see SQLITE_BUSY / database is locked.
 */
const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

const dbPath = path.join(__dirname, '..', 'harvestit.db')

if (!fs.existsSync(dbPath)) {
  console.log('No harvestit.db file yet. Nothing to reset.')
  process.exit(0)
}

const db = new sqlite3.Database(dbPath)

db.serialize(() => {
  db.run('DELETE FROM records', function (err) {
    if (err) {
      console.error(err.message)
      console.error('Tip: Stop npm start / node server.js, then run npm run db:reset again.')
      process.exit(1)
    }
    const n = this.changes
    db.run("DELETE FROM sqlite_sequence WHERE name = 'records'", () => {
      db.close((closeErr) => {
        if (closeErr) console.error(closeErr)
        console.log(n === 0 ? 'Database was already empty.' : `Cleared ${n} row(s). Leaderboard reset.`)
      })
    })
  })
})
