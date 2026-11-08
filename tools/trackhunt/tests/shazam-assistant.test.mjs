import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../lib/shazam-assistant.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseAssistantSnapshot, shazamAnalysis, finalShazamTracks, uniqueDeezerMatches, deezerNeedsReview, suggestedReviewPoints } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
function snapshot() {
  return { id: "job-1", fileName: "Set.m4a", status: "complete", message: "Finished", duration: 3600, step: 60, clipSeconds: 12, phase: "refinement", completed: 121, total: 121, currentSeconds: 3588, unknown: [900],
    tracks: Array.from({ length: 48 }, (_, i) => ({ identity: `track-${i}`, title: `Song ${i}`, artist: "Artist", seconds: i * 60, lastSeen: i * 60 + 12, hits: 2 })) };
}
test("imports all 48 detections into existing Sets format without a ten-track cap", () => {
  const v = snapshot(); v.tracks.reverse();
  const parsed = parseAssistantSnapshot(v), imported = shazamAnalysis(parsed);
  assert.equal(imported.tracks.length, 48); assert.equal(imported.tracks[0].seconds, 0);
  assert.equal(imported.tracks.at(-1).seconds, 2820); assert.equal(imported.source, "shazam-audio");
  assert.equal(imported.tracks[0].time, "≈ 0:00"); assert.equal(imported.title, "Set");
});
test("groups repeated songs without changing the original timeline", () => {
  const v = snapshot(); v.tracks[47]={...v.tracks[0], seconds:2820,lastSeen:2832};
  const before=JSON.stringify(v), rows=shazamAnalysis(parseAssistantSnapshot(v)).tracks;
  assert.equal(rows.length,47); assert.deepEqual(rows[0].occurrences,[0,2820]);
  assert.equal(rows[0].evidenceHits,4);assert.equal(JSON.stringify(v),before);
});
test("rejects invalid local payloads before importing", () => {
  for (const change of [v => v.tracks[0].seconds = -1, v => v.tracks[0].seconds = Infinity,
    v => v.completed = 200, v => v.unknown = [4000], v => v.status = "invented", v => v.tracks[0].hits = 0,
    v => v.tracks[0].title = "", v => v.step = 0]) {
    const v = snapshot(); change(v); assert.throws(() => parseAssistantSnapshot(v));
  }
});
test("a provider error remains an error even with partial detections", () => {
  const v = snapshot(); v.status = "error";
  assert.equal(parseAssistantSnapshot(v).status, "error");
});
test('YouTube captures retain provenance and all detections',()=>{
  const v=snapshot();v.source='youtube-tab';v.sourceURL='https://www.youtube.com/watch?v=oFxQkIvVye8';v.fileName='KYBBA LIVE SET.';
  const result=shazamAnalysis(parseAssistantSnapshot(v)); assert.equal(result.channel,'Shazam · fragmentos de YouTube');assert.equal(result.title,'KYBBA LIVE SET.');assert.equal(result.tracks.length,48);
  v.sourceURL='https://evil.test';assert.throws(()=>parseAssistantSnapshot(v));
});

test('review corrections preserve originals and exclude only the rejected occurrence',()=>{
  const v=snapshot(); v.reviews=[{seconds:0, originalIdentity:'track-0',artist:'Correct Artist',title:'Correct Version',decision:'confirmed'},{seconds:60,originalIdentity:'track-1',artist:'Artist',title:'Song 1',decision:'rejected'}];
  const parsed=parseAssistantSnapshot(v),result=shazamAnalysis(parsed);
  assert.equal(result.tracks.length,47);assert.equal(result.tracks[0].artist,'Correct Artist');assert.equal(result.tracks[0].title,'Correct Version');assert.equal(parsed.tracks[0].title,'Song 0');assert.equal(result.tracks[1].seconds,120);
  v.tracks[47].identity='track-1';assert.equal(shazamAnalysis(parseAssistantSnapshot(v)).tracks.length,47);
});
test('review follows its original detection anchor and never another identity',()=>{
  const v=snapshot();v.reviews=[{seconds:6,originalIdentity:'track-0',artist:'Correct',title:'Edit',decision:'confirmed'}];
  assert.equal(shazamAnalysis(parseAssistantSnapshot(v)).tracks[0].title,'Edit');
  v.tracks[0].identity='different';assert.equal(shazamAnalysis(parseAssistantSnapshot(v)).tracks[0].title,'Song 0');
});
test('targeted scans and saved reviews validate across local video and YouTube',()=>{
  for (const source of ['file','youtube-tab']) {
    const v=snapshot();v.phase='targeted';v.source=source;if(source==='youtube-tab')v.sourceURL='https://www.youtube.com/watch?v=oFxQkIvVye8';
    v.revision=7;v.savedAt='2026-11-04T20:00:00Z';assert.equal(parseAssistantSnapshot(v).phase,'targeted');
    v.reviews=[{seconds:-1,originalIdentity:'track-0',artist:'A',title:'B',decision:'confirmed'}];assert.throws(()=>parseAssistantSnapshot(v));
  }
});

test('mix credits stay in the original evidence but not in individual song exports',()=>{
  const v=snapshot();v.tracks[0].title='Mix Best of Dancehall Afro House (Live)';v.tracks[1].title='Mega Don Omar';
  const parsed=parseAssistantSnapshot(v);assert.equal(parsed.tracks.length,48);assert.equal(shazamAnalysis(parsed).tracks.length,46);
  v.reviews=[{seconds:0,originalIdentity:'track-0',artist:'Correct',title:'Individual song',decision:'confirmed'}];
  assert.equal(shazamAnalysis(parseAssistantSnapshot(v)).tracks.length,47);
});
test('ordinary remixes and extended mixes are not classified as compilations',()=>{
  const v=snapshot();v.tracks[0].title='Bounce Up (Remix)';v.tracks[1].title='Summer (Extended Mix)';v.tracks[2].title='Original Mix';
  assert.equal(shazamAnalysis(parseAssistantSnapshot(v)).tracks.length,48);
  v.tracks[0].hits=30;v.tracks[0].lastSeen=870;
  assert.equal(shazamAnalysis(parseAssistantSnapshot(v)).tracks.length,47);
});
test('speed-adjusted candidates retain original set times and stay unconfirmed',()=>{
  const v=snapshot();v.tracks[0].seconds=6;v.tracks[0].speedMultiplier=.945;
  const parsed=parseAssistantSnapshot(v);
  assert.equal(parsed.tracks[0].speedMultiplier,.945);
  assert.equal(shazamAnalysis(parsed).tracks[0].seconds,6);
  assert.equal(parsed.reviews,undefined);
  v.tracks[0].speedMultiplier=0;assert.throws(()=>parseAssistantSnapshot(v));
});

test('a pending correction groups with the same effective song but preserves another version',()=>{
 const v=snapshot();v.tracks=[
 {identity:'original',artist:'A',title:'Song',seconds:0,lastSeen:0,hits:2},
 {identity:'wrong',artist:'Wrong',title:'Song',seconds:30,lastSeen:30,hits:1},
 {identity:'remix',artist:'A',title:'Song (Remix)',seconds:60,lastSeen:60,hits:1}];
 v.reviews=[{originalIdentity:'wrong',seconds:30,artist:'A',title:'Song',decision:'pending'}];
 const rows=finalShazamTracks(v); assert.equal(rows.length,2);assert.deepEqual(rows[0].occurrences,[0,30]);
 assert.match(rows[0].recognitionReview,/Revisión guardada pendiente/);assert.match(rows[1].recognitionReview,/Una sola muestra/);
 assert.equal(v.tracks[1].artist,'Wrong');
});
test('repeated evidence resolves the single-sample warning without inventing user confirmation',()=>{
 const v=snapshot();v.tracks=v.tracks.slice(0,1);v.tracks[0].hits=1;
 assert.ok(finalShazamTracks(v)[0].recognitionReview);
 v.tracks.push({...v.tracks[0],seconds:30,lastSeen:30,speedMultiplier:.945});
 const row=finalShazamTracks(v)[0];assert.equal(row.recognitionReview,undefined);assert.equal(row.recognitionConfirmed,false);
 v.tracks.pop();v.reviews=[{originalIdentity:'track-0',seconds:0,artist:'Artist',title:'Song 0',decision:'confirmed'}];
 assert.equal(finalShazamTracks(v)[0].recognitionReview,undefined);
});
test('Deezer exports deduplicate catalog IDs and exclude acoustic or version doubts',()=>{
 const base={status:'matched',deezer:{id:123,link:'https://www.deezer.com/track/123',score:1,artistScore:1}};
 const rows=[base,{...base},{...base,deezer:{id:456,link:'x',score:1},recognitionReview:'single sample'},
 {...base,deezer:{id:789,link:'x'},status:'review'}, {...base,deezer:{id:-1,link:'x'}}];
 assert.deepEqual(uniqueDeezerMatches(rows).map(t=>t.deezer.id),[123]);
 rows[2].recognitionApproved=true;assert.deepEqual(uniqueDeezerMatches(rows).map(t=>t.deezer.id),[123,456]);
});
test('suggested review is bounded and never changes source or stored detections',()=>{
 const v=snapshot();v.tracks[0].title='Mix Best of Dancehall';const before=JSON.stringify(v);
 const p=suggestedReviewPoints(v);assert.ok(p.length<=16);assert.equal(p[0].speedMultiplier,.945);
 assert.ok(p.every(x=>x.start>=0&&x.end>x.start&&x.start+12<=v.duration));
 assert.equal(JSON.stringify(v),before);
});

test('an exact title with another artist stays in review even with a high combined score',()=>{
 assert.equal(deezerNeedsReview({score:.88,artistScore:.33}),true);
 assert.equal(deezerNeedsReview({score:1,artistScore:1}),false);
 assert.equal(deezerNeedsReview({score:1,artistScore:1,versionConflict:true}),true);
 const row={status:'matched',deezer:{id:123,link:'x',score:.88,artistScore:.33}};
 assert.equal(uniqueDeezerMatches([row]).length,0);
 assert.equal(uniqueDeezerMatches([{...row,deezerApproved:true}]).length,1);
});
