import {readFile,writeFile,readdir} from 'node:fs/promises';
import {chartCsv} from '../src/sizing.mjs';
const files=await readdir(new URL('../dist/assets/',import.meta.url));
let html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
for(const file of files) {
  const content=await readFile(new URL('../dist/assets/'+file,import.meta.url),'utf8');
  if(file.endsWith('.js')) html=html.replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/,()=>'<script type="module">'+content.replaceAll('</script','<\\/script')+'</script>');
  if(file.endsWith('.css')) html=html.replace(/<link rel="stylesheet"[^>]*>/,()=>'<style>'+content+'</style>');
}
await writeFile(new URL('../dist/Mi-Talla.html',import.meta.url),html);
await writeFile(new URL('../dist/Tabla-tallas-Chile-1-a-40.csv',import.meta.url),chartCsv('reference'));
console.log('Archivo portátil: dist/Mi-Talla.html');
