import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildImportTemplate } from '../src/imports/import-templates';
import { ImportPath } from '../src/imports/import-kind';
import { KINDS } from '../src/imports/imports.service';

/** /imports/templates/:type bilan bir xil fayl (ImportsService.template ham buildImportTemplate'ni chaqiradi) → docs/templates/<tur>-shablon.xlsx */
async function main(): Promise<void> {
  const outDir = join(__dirname, '..', '..', 'docs', 'templates');
  await mkdir(outDir, { recursive: true });
  for (const path of Object.keys(KINDS) as ImportPath[]) {
    const file = join(outDir, `${path}-shablon.xlsx`);
    await writeFile(file, await buildImportTemplate(path, KINDS[path].columns));
    console.log(`yozildi: ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
