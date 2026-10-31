import {readFile,writeFile,readdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const files=await readdir(new URL('dist/assets/',root));
const css=await readFile(new URL('dist/assets/'+files.find(x=>x.endsWith('.css')),root),'utf8');
let js=await readFile(new URL('dist/assets/'+files.find(x=>x.endsWith('.js')),root),'utf8');
for(const file of files.filter(x=>x.endsWith('.png'))){const data=await readFile(new URL('dist/assets/'+file,root));js=js.replaceAll('/assets/'+file,'data:image/png;base64,'+data.toString('base64'));}
await writeFile(new URL('prueba.html',root),`<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#5a2333"><title>Club Santa Cruz · Prueba usable 0.2</title><style>${css}</style></head><body><div id="root"></div><script type="module">${js.replaceAll('</script','<\\/script')}</script></body></html>`);
console.log('Prueba portátil creada: prueba.html');
