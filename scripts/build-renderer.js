/**
 * Bundle renderer scripts using esbuild
 */

const esbuild = require('esbuild')
const path = require('path')

async function build() {
  try {
    // Bundle player.js
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/renderer/player.ts')],
      bundle: true,
      outfile: path.join(__dirname, '../dist/renderer/player.bundle.js'),
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      format: 'iife', // Immediately Invoked Function Expression for browser
      external: ['electron'], // Don't bundle electron
    })

    // Bundle pairing.js
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/renderer/pairing.ts')],
      bundle: true,
      outfile: path.join(__dirname, '../dist/renderer/pairing.bundle.js'),
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      format: 'iife',
      external: ['electron'],
    })

    // Bundle diagnostics.js
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/renderer/diagnostics.ts')],
      bundle: true,
      outfile: path.join(__dirname, '../dist/renderer/diagnostics.bundle.js'),
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      format: 'iife',
      external: ['electron'],
    })

    console.log('✓ Renderer scripts bundled successfully')
  } catch (error) {
    console.error('Failed to bundle renderer scripts:', error)
    process.exit(1)
  }
}

build()

