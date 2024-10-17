'use strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

//! Target directory
const distDir = path.resolve(__dirname, '../dist')

/** @param {string} filePath */
function replaceTsWithJs(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const updatedContent = fileContent.replace(/(\.ts)(?=['";])/g, '.js')
  fs.writeFileSync(filePath, updatedContent)
}

/** @param {string} dir */
function traverseDirectory(dir) {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stats = fs.statSync(filePath)

    if (stats.isDirectory()) {
      //? Recursively process subdirectories
      traverseDirectory(filePath)
    } else if (path.extname(file) === '.js') {
      //? Process JS files to replace .ts with .js in import paths
      replaceTsWithJs(filePath)
    }
  }
}

console.time('Successfully replaced .ts extensions with .js')
traverseDirectory(distDir)
console.timeEnd('Successfully replaced .ts extensions with .js')
