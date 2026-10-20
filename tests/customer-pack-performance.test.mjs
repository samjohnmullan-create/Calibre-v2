import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const documents = await readFile(new URL('../src/customerDocuments.ts', import.meta.url), 'utf8')

test('Customer document helpers load jsPDF only when a PDF is generated', () => {
  assert.doesNotMatch(documents, /^import \{ jsPDF \} from ['"]jspdf['"]/m)
  assert.match(documents, /import type \{ jsPDF as JsPdfDocument \} from ['"]jspdf['"]/)
  assert.equal((documents.match(/await import\(['"]jspdf['"]\)/g) ?? []).length, 2)
})
