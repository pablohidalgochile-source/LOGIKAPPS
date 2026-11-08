import { z } from 'zod';
import { briefSchema, proposalSchema } from './generation.ts';
import type { SavedIdea } from './bridge';
const savedSchema=z.object({id:z.string().min(1).max(100),date:z.string().datetime(),brief:briefSchema,proposal:proposalSchema,project:z.string().max(100).optional(),favorite:z.boolean().optional(),notes:z.string().max(2000).optional()});
export const librarySchema=z.array(savedSchema).max(100);
export function readLibrary(value:unknown):SavedIdea[]{
 const parsed=librarySchema.safeParse(value);if(!parsed.success)throw new Error('El respaldo no tiene el formato de MAGIC MUSIC PROMPT o supera 100 versiones.');
 return parsed.data;
}
export function readBackup(text:string):SavedIdea[]{
 let data;try{data=JSON.parse(text);}catch{throw new Error('No se pudo leer el respaldo JSON.');}
 if(data?.format!=='magic-music-prompt'||data?.version!==1)throw new Error('Este archivo no es un respaldo compatible.');
 return readLibrary(data.ideas);
}
export function mergeLibrary(current:SavedIdea[],incoming:SavedIdea[]):SavedIdea[]{
 const all=readLibrary(current);for(const item of readLibrary(incoming)){const old=all.find(v=>v.id===item.id);if(!old)all.push(item);else if(JSON.stringify(old)!==JSON.stringify(item))all.push({...item,id:crypto.randomUUID()});}
 if(all.length>100)throw new Error('El respaldo superaría 100 versiones. Exporta y elimina algunas antes de importar.');
 return all.sort((a,b)=>b.date.localeCompare(a.date));
}
export function backupLibrary(ideas:SavedIdea[]){return JSON.stringify({format:'magic-music-prompt',version:1,exportedAt:new Date().toISOString(),ideas},null,2);}
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
