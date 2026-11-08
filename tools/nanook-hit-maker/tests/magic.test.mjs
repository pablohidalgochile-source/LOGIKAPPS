import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../magic_worker.mjs';
import {musicRecipes,proposalSchema} from '../vendor/magic/engine.mjs';
const brief={idea:'Un pop cálido con un coro breve sobre regresar a casa.',bpm:124,vocals:'Voz femenina',language:'Español',withLyrics:true};
const proposal={title:'Luz de casa',summary:'Un regreso luminoso.',tempo:124,tonality:'La menor',hook:'Tres notas que suben y descansan.',lyrics:'[Chorus]\nYa vuelvo a casa',direction:'Bajo en respuesta al piano.',variants:['a','b','c'].map((id,i)=>({id,label:['Piano cercano','Cuerdas suaves','Banda acústica'][i],description:'Un color instrumental distinto.',style:'Intimate warm pop, 124 BPM. A short piano figure with a clear female vocal.',exclude:'festival drops'})),tips:['Revisa el ritmo del motivo.']};
const reply=p=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(p)}]}]}));
test('real MAGIC engine receives linked musical context and strict schema without leaking credentials into input',async()=>{
 let sent;const result=await run({brief,context:{parts:[{status:'candidata sin revisar',sample:[{midi:60,beat:0,beats:1}]}]}},'FAKE_TEST_SECRET','test-model',async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(init.body);assert.equal(init.headers.Authorization,'Bearer FAKE_TEST_SECRET');return reply(proposal);});
 assert.equal(sent.store,false);assert.equal(sent.text.format.strict,true);assert.equal(sent.model,'test-model');
 assert.equal(JSON.parse(sent.input).musicalContext.parts[0].sample[0].midi,60);
 assert.ok(sent.instructions.includes('candidatos'));assert.ok(!JSON.stringify(sent).includes('FAKE_TEST_SECRET'));
 assert.equal(result.proposal.variants[1].id,'club');assert.equal(result.proposal.variants[1].label,'Cuerdas suaves');
 assert.ok(proposalSchema.safeParse(result.proposal).success);
});
test('schema and tempo failures never become usable proposals',async()=>{
 await assert.rejects(run({brief,context:{}},'fake','test-model',async()=>reply({...proposal,tempo:120})),/tempo/);
 await assert.rejects(run({brief,context:{}},'fake','test-model',async()=>reply({...proposal,variants:[]})),/formato/);
});
test('instrumental and prompts-only requests cannot overwrite lyrics with invented singing',async()=>{
 for(const opts of [{vocals:'Instrumental'},{withLyrics:false}]){
  const r=await run({brief:{...brief,...opts},context:{}},'fake','test-model',async()=>reply(proposal));assert.equal(r.proposal.lyrics,'');
 }
});
test('recipe library is preserved and provider errors expose controlled messages',async()=>{
 assert.equal(musicRecipes.length,24);assert.equal(new Set(musicRecipes.map(r=>r.id)).size,24);
 await assert.rejects(run({brief,context:{}},'fake','test-model',async()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'PRIVATE_PROVIDER_BODY'}}),{status:429})),e=>e.message.includes('saldo')&&!e.message.includes('PRIVATE'));
});
