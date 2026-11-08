import { z } from 'zod';
import { briefSchema, proposalSchema, songSectionSchema } from './generation.ts';
import type { Brief, Proposal } from './bridge';

// A draft may be halfway through an edit; generation validation stays stricter.
export const draftBriefSchema = briefSchema.extend({
  idea: z.string().max(3000),
  bpm: z.preprocess(v=>v===null?NaN:v,z.union([z.number().finite().min(-10000).max(10000),z.nan()])),
  sections: z.array(songSectionSchema.extend({ label: z.string().max(60).regex(/^[^\[\]\r\n]*$/) })).max(16).default([]),
  advanced: briefSchema.shape.advanced.removeDefault().innerType(),
});
export function briefFingerprint(brief:Brief){const parsed=draftBriefSchema.safeParse(brief);return JSON.stringify(parsed.success?parsed.data:brief);}
const draftProposalSchema = proposalSchema.extend({
  variants: z.array(proposalSchema.shape.variants.innerType().element.extend({ style: z.string().max(1000) })).length(3)
    .refine(v => new Set(v.map(x => x.id)).size === 3),
});
export const workspaceSchema = z.object({
  brief: draftBriefSchema,
  proposal: draftProposalSchema,
  baseline: draftBriefSchema,
  source: z.string().max(60),
  variantIndex: z.number().int().min(0).max(2),
  tab: z.enum(['style', 'lyrics', 'exclude', 'direction']),
  projectName: z.string().max(100),
}).strict();
export type Workspace = { brief: Brief; proposal: Proposal; baseline: Brief; source: string; variantIndex: number; tab: 'style'|'lyrics'|'exclude'|'direction'; projectName: string };
const sessionSchema = z.object({ format: z.literal('magic-music-session'), version: z.literal(1), updatedAt: z.string().datetime(), current: workspaceSchema, previous: workspaceSchema.nullable() }).strict();
export function serializeSession(current: Workspace, previous: Workspace|null, now = new Date().toISOString()) {
  return JSON.stringify(sessionSchema.parse({format:'magic-music-session',version:1,updatedAt:now,current,previous}));
}
export function readSession(text: string) {
  if (text.length > 600000) throw new Error('El borrador supera el tamaño permitido.');
  return sessionSchema.parse(JSON.parse(text));
}
export function persistSession(storage:Pick<Storage,'getItem'|'setItem'>,key:string,current:Workspace,previous:Workspace|null,expected:string|null){
  if(storage.getItem(key)!==expected)return {conflict:true as const};
  if(expected){
    try{
      const old=readSession(expected);
      const unchanged=serializeSession(current,previous,old.updatedAt)===serializeSession(old.current,old.previous,old.updatedAt);
      if(unchanged)return {conflict:false as const,raw:expected};
    }catch{ /* The caller may explicitly replace an unreadable, backed-up draft. */ }
  }
  const raw=serializeSession(current,previous);
  storage.setItem(key,raw);
  return {conflict:false as const,raw};
}

const templateSchema=z.object({id:z.string().min(1).max(100),name:z.string().trim().min(1).max(80),updatedAt:z.string().datetime(),brief:draftBriefSchema}).strict();
export type MusicTemplate=z.infer<typeof templateSchema>;
export const templatesSchema=z.array(templateSchema).max(24).refine(v=>new Set(v.map(x=>x.id)).size===v.length);
export function readTemplates(text:string):MusicTemplate[]{
  if(text.length>5000000)throw new Error('El archivo de plantillas supera el tamaño permitido.');
  const data=JSON.parse(text);
  if(data?.format!=='magic-music-templates'||data.version!==1)throw new Error('Este archivo no es un respaldo de plantillas.');
  return templatesSchema.parse(data.templates);
}
export function serializeTemplates(templates:MusicTemplate[]){return JSON.stringify({format:'magic-music-templates',version:1,templates:templatesSchema.parse(templates)},null,2);}
export function mergeTemplates(current:MusicTemplate[],incoming:MusicTemplate[]):MusicTemplate[]{
  const all=templatesSchema.parse(current);
  for(const item of templatesSchema.parse(incoming)){
    const found=all.find(x=>x.id===item.id);
    if(!found)all.push(item);
    else if(JSON.stringify(found)!==JSON.stringify(item))all.push({...item,id:crypto.randomUUID()});
  }
  if(all.length>24)throw new Error('El respaldo superaría 24 plantillas. Conserva un respaldo y libera espacio antes de importar.');
  return all;
}

export function sunoFields(proposal:Proposal,index:number,brief:Brief){
  const variant=proposal.variants[index];
  if(!variant)throw new Error('Elige una dirección musical.');
  const instrumental=brief.vocals==='Instrumental';
  const fields=[{id:'title',label:'Título',text:proposal.title},{id:'style',label:'Styles',text:variant.style},
    ...(!instrumental&&proposal.lyrics.trim()?[{id:'lyrics',label:'Lyrics',text:proposal.lyrics}]:[]),
    ...(variant.exclude.trim()?[{id:'exclude',label:'Exclude',text:variant.exclude}]:[])];
  return {instrumental,fields,hasLyrics:!instrumental&&!!proposal.lyrics.trim()};
}
export function sunoTransferText(proposal:Proposal,index:number,brief:Brief){
  const {instrumental,fields}=sunoFields(proposal,index,brief);
  return `MAGIC MUSIC PROMPT · ${proposal.variants[index].label}\n${proposal.tempo} BPM · ${proposal.tonality}\n${instrumental?'Activar Instrumental en Suno':'Voces según Styles'}\n\n${fields.map(f=>`${f.label.toUpperCase()}\n${f.text}`).join('\n\n')}\n\nGUION DE PRODUCCIÓN · REFERENCIA, NO PEGAR EN LYRICS\n${proposal.direction||'Sin guion adicional'}\n\nGANCHO\n${proposal.hook}`;
}
