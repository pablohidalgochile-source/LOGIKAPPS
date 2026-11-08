import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const modelUrl = compile(await readFile(new URL('../lib/playlist-hunt.ts', import.meta.url), 'utf8'));
const model = await import(modelUrl);
const server = await import(compile((await readFile(new URL('../lib/playlist-hunt-server.ts', import.meta.url), 'utf8')).replace('"./playlist-hunt"', JSON.stringify(modelUrl))));
const input = { reference: { artist: 'Kapo ft. Ryan Castro', title: 'DÓNDE' }, context: 'Caribbean Summer / dancehall / afrocaribeño / playero', controls: { ...model.DEFAULT_CONTROLS, count: 5 }, feedback: [] };
const suggestion = (title = 'Song') => ({ artist: 'Artist', title, genre: 'Dancehall', region: 'Caribe', language: 'Español', energy: 60, similarity: 85, reason: 'Aporta un pulso cálido y voces melódicas.', stage: 'Dancehall' });
const track = (overrides = {}) => ({ id: '1', ...suggestion(), bpm: null, bpmSource: 'pending', key: null, duration: null, deezerId: null, catalogStatus: 'unverified', ...overrides });
test('validates range, finite controls, reference and bounded feedback', () => {
  assert.equal(model.parseHuntInput(input).controls.bpmMin, 90);
  for (const c of [{ bpmMin: 110, bpmMax: 90 }, { count: 500 }, { discovery: NaN }, { energy: '90' }]) assert.throws(() => model.parseHuntInput({ ...input, controls: { ...input.controls, ...c } }));
  assert.throws(() => model.parseHuntInput({ ...input, reference: {} }));
  assert.equal(model.parseHuntInput({ ...input, feedback: [null, {}, { artist: 'A', title: 'B', decision: 'reject' }] }).feedback.length, 1);
});
test('removes duplicate and rejected suggestions; never accepts AI BPM, key or IDs', () => {
  const data = server.parseSuggestions({ name: 'Summer', summary: 'Test', tracks: [suggestion('DÓNDE'), suggestion('donde'), { ...suggestion('Other'), bpm: 100, key: '8A', deezerId: 123 }] }, { ...input, feedback: [{ artist: 'Artist', title: 'DONDE', decision: 'reject' }] });
  assert.equal(data.tracks.length, 1); assert.equal(data.tracks[0].bpm, null); assert.equal(data.tracks[0].key, null); assert.equal(data.tracks[0].deezerId, null);
});
test('catalog match rejects wrong artist and wrong version titles', () => {
  assert.equal(server.catalogMatch(suggestion(), { title: 'Song', artist: { name: 'Artist' } }), true);
  assert.equal(server.catalogMatch(suggestion(), { title: 'Song', artist: { name: 'Other' } }), false);
  assert.equal(server.catalogMatch(suggestion(), { title: 'Song Remix', artist: { name: 'Artist' } }), false);
});
test('journey preserves every track and sorts stage then energy without mutation', () => {
  const tracks = [track({ id: 'a', stage: 'Peak' }), track({ id: 'b', stage: 'Warm Up', energy: 50 }), track({ id: 'c', stage: 'Warm Up', energy: 20 })];
  assert.deepEqual(model.buildJourney(tracks).map(t => t.id), ['c', 'b', 'a']); assert.equal(tracks[0].id, 'a');
});
test('exports escape CSV/XML and include only linked local files, never search pages as audio', () => {
  const files = model.exportFiles('Summer & Night', [track({ artist: '=CMD()', title: 'A "quote" & B' }), track({ id: '2' })], { '1': '/Music/a & b.mp3', '2': 'https://example.com/audio.mp3' });
  assert.match(files['playlist.csv'], /'=CMD/); assert.match(files['playlist.csv'], /""quote""/);
  assert.match(files['rekordbox.xml'], /Summer &amp; Night/); assert.match(files['rekordbox.xml'], /Entries="1"/); assert.match(files['rekordbox.xml'], /file:\/\/localhost\/Music\/a%20%26%20b.mp3/);
  assert.match(files['playlist.m3u8'], /\/Music\/a & b.mp3/); assert.doesNotMatch(files['playlist.m3u8'], /https/);
  assert.equal(model.exportFiles('Empty links', [track()])['playlist.m3u8'].split('\n').length, 2);
});
test('ZIP has valid local records, CRCs and central directory with all files', () => {
  const files = model.exportFiles('Caribbean Summer', [track()]); const zip = model.zipFiles(files), view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50); assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 14, true), Object.keys(files).length);
  let offset = 0; for (const [name, content] of Object.entries(files)) { const length = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true); assert.equal(new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength)), name); assert.equal(new TextDecoder('utf-8', { ignoreBOM: true }).decode(zip.slice(offset + 30 + nameLength, offset + 30 + nameLength + length)), content); offset += 30 + nameLength + length; }
});
test('generation verifies identity and BPM, removes out-of-range tracks, exposes unknowns', async () => {
  let sent;
  const remote = async (url, init) => {
    url = String(url);
    if (url.includes('openai.com')) { sent = JSON.parse(init.body); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ name: 'Summer', summary: 'Test', tracks: [suggestion('Good'), suggestion('Fast'), suggestion('Unknown')] }) }] }] }); }
    if (url.includes('/search')) { const q = new URL(url).searchParams.get('q'); return Response.json({ data: q.includes('Unknown') ? [] : [{ id: q.includes('Good') ? 1 : 2, title: q.includes('Good') ? 'Good' : 'Fast', artist: { name: 'Artist' }, duration: 200 }] }); }
    return Response.json({ bpm: url.endsWith('/1') ? 100 : 140 });
  };
  const result = await server.generateHunt(input, 'test-key', remote);
  assert.equal(sent.store, false); assert.equal(sent.text.format.strict, true); assert.deepEqual(JSON.parse(sent.input).controls, input.controls);
  assert.equal(result.tracks.length, 1); assert.equal(result.tracks[0].bpm, 100); assert.equal(result.tracks[0].catalogStatus, 'verified'); assert.ok(result.warnings.some(w => w.includes('descartaron')));
});
test('provider failures and missing credits do not return fabricated playlists', async () => {
  await assert.rejects(server.generateHunt(input, '', async () => { throw new Error('should not call'); }), /clave/);
  await assert.rejects(server.generateHunt(input, 'test', async () => Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 })), /saldo/);
  await assert.rejects(server.generateHunt(input, 'test', async () => Response.json({ status: 'incomplete' })), /incompleta/);
  await assert.rejects(server.generateHunt(input, 'test', async () => Response.json({ status: 'completed', output: [] })), /válida/);
});

test('catalog tolerates credit formatting and original mix but preserves alternate editions', () => {
  const wanted = { artist:'Kapo feat. Guest', title:'Song (Original Mix)' };
  assert.equal(server.catalogMatch(wanted,{title:'Song (feat. Guest)',artist:{name:'Kapo'}}),true);
  assert.equal(server.catalogMatch(wanted,{title:'Song',title_version:'Extended Mix',artist:{name:'Kapo'}}),false);
  assert.equal(server.catalogMatch(wanted,{title:'Song',title_version:'Original Mix',artist:{name:'Kapo'}}),true);
  assert.equal(server.catalogMatch(wanted,{title:'Song (Guest Remix)',artist:{name:'Kapo'}}),false);
});
test('refills missing candidates, never repeats attempts, and reports actual progress', async () => {
  let rounds=0; const sent=[], progress=[], ids={First:101,Second:102,Third:103,Fourth:104,Fifth:105};
  const remote=async(raw,init)=>{
    const url=new URL(raw);
    if(url.hostname==='api.openai.com') {
      sent.push(JSON.parse(JSON.parse(init.body).input));
      const titles=++rounds===1?['First','Missing']:['First','Second','Third','Fourth','Fifth'];
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({name:'Filled',summary:'',tracks:titles.map(suggestion)})}]}]});
    }
    if(url.pathname==='/search') { const q=url.searchParams.get('q');const title=Object.keys(ids).find(t=>q.includes(t));return Response.json({data:title?[{id:ids[title],title,artist:{name:'Artist'}}]:[]}); }
    return Response.json({bpm:100});
  };
  const result=await server.generateHunt(input,'test',remote,p=>progress.push(p));
  assert.equal(result.tracks.length,5);assert.equal(result.stats.rounds,2);assert.equal(new Set(result.tracks.map(t=>t.deezerId)).size,5);
  assert.ok(sent[1].excluded.includes('Artist — Missing'));assert.ok(sent[1].excluded.includes('Artist — First'));
  assert.equal(progress.at(-1).accepted,5);assert.equal(result.stats.checked,6);
});
test('secondary catalog queries recover a real match; provider failure during refill preserves it', async()=>{
  let rounds=0, searches=0;
  const remote=async(raw,init)=>{
    const url=new URL(raw);
    if(url.hostname==='api.openai.com') {
      if(++rounds>1) return Response.json({error:{code:'rate_limit'}},{status:429});
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({name:'Keep',summary:'',tracks:[suggestion('Rare')]})}]}]});
    }
    if(url.pathname==='/search') return Response.json({data:++searches===1?[]:[{id:777,title:'Rare',artist:{name:'Artist'}}]});
    return Response.json({bpm:99});
  };
  const result=await server.generateHunt(input,'test',remote);
  assert.equal(searches,2);assert.equal(result.tracks[0].deezerId,777);assert.ok(result.warnings.some(w=>w.includes('interrumpió')));
});
test('cancellation starts no new provider work and Afro House is not labeled Afrobeat',async()=>{
  const abort=new AbortController();abort.abort();
  await assert.rejects(server.generateHunt(input,'test',async()=>{throw new Error('must not request')},undefined,abort.signal),/cancelada/);
  const parsed=server.parseSuggestions({name:'Stage',summary:'',tracks:[{...suggestion('House'),genre:'Afro House',stage:'Afrobeat',energy:80}]},input);
  assert.equal(parsed.tracks[0].stage,'Peak');
});

test('last refill selects actual catalog alternatives and does not accept an invented replacement',async()=>{
  let rounds=0;const sent=[];
  const remote=async(raw,init)=>{
    const url=new URL(raw);
    if(url.hostname==='api.openai.com') {
      const prompt=JSON.parse(JSON.parse(init.body).input);sent.push(prompt);rounds++;
      const tracks=rounds<3?[suggestion('Missing '+rounds)]:[{...suggestion('Real Song'),artist:'Kapo'},suggestion('Invented')];
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({name:'Catalog',summary:'',tracks})}]}]});
    }
    if(url.pathname==='/search') {
      const q=url.searchParams.get('q');
      return Response.json({data:q==='artist:"Kapo"'?[{id:501,title:'Real Song',artist:{name:'Kapo'},duration:200},{id:502,title:'DÓNDE',artist:{name:'Kapo'}}]:[]});
    }
    return Response.json({bpm:100});
  };
  const result=await server.generateHunt(input,'test',remote);
  assert.equal(result.tracks.length,1);assert.equal(result.tracks[0].deezerId,501);
  assert.deepEqual(sent[2].availableCatalog,[{artist:'Kapo',title:'Real Song'}]);
  assert.equal(result.stats.checked,3);assert.equal(result.stats.rounds,3);
});
