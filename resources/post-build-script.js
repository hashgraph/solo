'use strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

//! Target directory
const distDir = path.resolve(__dirname, '../dist')
const srcPackageJsonFilePath = path.resolve(__dirname, '../package.json')
const targetPackageJsonFilePath = path.join(distDir, 'src', 'package.json')
const srcResourcesDir = path.join(__dirname, '../resources')
const targetResourcesDir = path.join(distDir, 'resources')

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

function copyPackageJson(srcPackageJsonFilePath, targetPackageJsonFilePath) {
  fs.copyFileSync(srcPackageJsonFilePath, targetPackageJsonFilePath)
}

function copyResources(srcDir, targetDir) {
  fs.cpSync(srcDir, targetDir, {recursive: true})
}

console.time('Copy package.json')
copyPackageJson(srcPackageJsonFilePath, targetPackageJsonFilePath)
console.time('Copy resources')
copyResources(srcResourcesDir, targetResourcesDir)
console.time('Successfully replaced .ts extensions with .js')
traverseDirectory(distDir)
console.timeEnd('Successfully replaced .ts extensions with .js')
