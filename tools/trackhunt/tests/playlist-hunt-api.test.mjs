import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const host = compile(await readFile(new URL('../lib/request-host.ts', import.meta.url), 'utf8'));
const securityUrl = compile((await readFile(new URL('../lib/request-security.ts', import.meta.url), 'utf8')).replace('"./request-host"', JSON.stringify(host)));
const security = await import(securityUrl);
test('audio clip limit permits 12 seconds only with explicit override; origin stays mandatory', () => {
  const req = new Request('http://localhost/api/remix/recognize', { method: 'POST', headers: { origin: 'http://localhost', 'content-length': '384044' } });
  assert.equal(security.mutationSecurityError(req).status, 413);
  assert.equal(security.mutationSecurityError(req, undefined, 1_000_000), null);
  assert.equal(security.mutationSecurityError(new Request('http://localhost/api/remix/recognize', { method: 'POST', headers: { origin: 'https://evil.test', 'content-length': '384044' } }), undefined, 1_000_000).status, 403);
});
test('Playlist Hunt authenticates, rejects cross-origin and malformed requests before generation', async () => {
  const model = compile(await readFile(new URL('../lib/playlist-hunt.ts', import.meta.url), 'utf8'));
  const stub = compile('export class HuntError extends Error {} export async function generateHunt() { throw new Error("Must not generate"); }');
  const source = (await readFile(new URL('../app/api/playlist-hunt/route.ts', import.meta.url), 'utf8'))
    .replace('import { env } from "cloudflare:workers";', 'const env = {};')
    .replace('"../../../lib/playlist-hunt"', JSON.stringify(model))
    .replace('"../../../lib/playlist-hunt-server"', JSON.stringify(stub))
    .replace('"../../../lib/request-security"', JSON.stringify(securityUrl));
  const { POST } = await import(compile(source));
  const auth = { 'oai-authenticated-user-id': 'test', 'oai-authenticated-user-email': 'test@example.com' };
  const request = (headers = {}, body = '{}') => new Request('https://trackhunt.test/api/playlist-hunt', { method: 'POST', headers, body });
  assert.equal((await POST(request())).status, 401);
  assert.equal((await POST(request({ ...auth, origin: 'https://evil.test' }))).status, 403);
  assert.equal((await POST(request({ ...auth, origin: 'https://trackhunt.test' }))).status, 415);
  const headers = { ...auth, origin: 'https://trackhunt.test', 'content-type': 'application/json' };
  assert.equal((await POST(request(headers, 'bad json'))).status, 400);
  assert.equal((await POST(request(headers, '{}'))).status, 400);
  assert.equal((await POST(request(headers, ' '.repeat(48001)))).status, 413);
});

async function streamingRoute(behavior) {
  const model = compile(await readFile(new URL('../lib/playlist-hunt.ts', import.meta.url), 'utf8'));
  const stub = compile(`export class HuntError extends Error {} export async function generateHunt(input,key,remote,progress,signal) { ${behavior} }`);
  const source = (await readFile(new URL('../app/api/playlist-hunt/route.ts', import.meta.url), 'utf8'))
    .replace('import { env } from "cloudflare:workers";', 'const env = {};')
    .replace('"../../../lib/playlist-hunt"', JSON.stringify(model))
    .replace('"../../../lib/playlist-hunt-server"', JSON.stringify(stub))
    .replace('"../../../lib/request-security"', JSON.stringify(securityUrl));
  return (await import(compile(source))).POST;
}
function streamRequest(user) {
  return new Request('https://trackhunt.test/api/playlist-hunt', {method:'POST',headers:{
    'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test',origin:'https://trackhunt.test',
    'content-type':'application/json',accept:'application/x-ndjson'
  },body:JSON.stringify({reference:{artist:'Artist',title:'Song'},context:'Summer',controls:{discovery:50,commercial:50,energy:50,international:50,bpmMin:90,bpmMax:105,count:5,localRegion:'Chile'}})});
}
test('stream delivers progress and final result, releases the generation guard', async()=>{
  const post=await streamingRoute('progress({phase:"suggesting",round:1,checked:0,accepted:0,target:5}); return {name:"Ready",tracks:[]};');
  for(let i=0;i<2;i++) {
    const response=await post(streamRequest('stream-success'));
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/ndjson/);
    const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(events[0].type,'progress');assert.equal(events[1].result.name,'Ready');
  }
});
test('stream reports errors without leaking internals and can be retried',async()=>{
  const post=await streamingRoute('throw new Error("private provider details");');
  for(let i=0;i<2;i++) {
    const response=await post(streamRequest('stream-error'));
    const event=JSON.parse(await response.text());assert.equal(event.type,'error');assert.doesNotMatch(event.error,/private/);
  }
});
test('canceling the response aborts recognition and releases the active guard', {timeout:2000},async()=>{
  const post=await streamingRoute('progress({phase:"suggesting",round:1,checked:0,accepted:0,target:5}); await new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}));');
  const response=await post(streamRequest('stream-cancel')), reader=response.body.getReader();
  await reader.read();assert.equal((await post(streamRequest('stream-cancel'))).status,429);
  await reader.cancel();await new Promise(resolve=>setTimeout(resolve,0));
  const retried=await post(streamRequest('stream-cancel'));assert.equal(retried.status,200);await retried.body.cancel();
});
