import test from 'node:test';
import assert from 'node:assert/strict';
import {editsAfterSave} from '../public/autosync.mjs';
const part=(key,pitch,id)=>({key,name:key,abletonChannel:id,notes:[{pitch,start:0,duration:1,amplitude:.8}]});
test('typing during autosave survives a rebased response with changes in another part',()=>{
 const sent={title:'Umbral',lyrics:'Letra',parts:[part('bass',36,'m-a'),part('melody',60,'m-b')]};
 const typed=structuredClone(sent);typed.parts[0].notes[0].pitch=38;typed.lyrics='Letra nueva';
 const accepted=structuredClone(sent);accepted.revision=9;accepted.parts[1].notes[0].pitch=64;
 const merged=editsAfterSave(sent,typed,accepted);assert.equal(merged.revision,9);assert.equal(merged.parts[0].notes[0].pitch,38);assert.equal(merged.parts[1].notes[0].pitch,64);assert.equal(merged.lyrics,'Letra nueva');
});
test('first autosave assigns identities without confusing two equal instrument names',()=>{
 const sent={parts:[part('other',60),part('other',64)]},typed=structuredClone(sent),accepted=structuredClone(sent);
 typed.parts[1].notes[0].pitch=67;accepted.parts[0].abletonChannel='m-a';accepted.parts[1].abletonChannel='m-b';
 const merged=editsAfterSave(sent,typed,accepted);assert.deepEqual(merged.parts.map(p=>p.notes[0].pitch),[60,67]);assert.deepEqual(merged.parts.map(p=>p.abletonChannel),['m-a','m-b']);
});

test('typing an audio edit during autosave keeps accepted media and unrelated Live tracks',()=>{
 const sent={parts:[],audio_tracks:[{id:'a-1',name:'Stem',clips:[{gainDb:0}],previewAssetId:'old'}]};
 const newer=structuredClone(sent);newer.audio_tracks[0].clips[0].gainDb=-6;
 const accepted=structuredClone(sent);accepted.audio_tracks[0].previewAssetId='new';accepted.audio_tracks.push({id:'a-2',name:'Live',clips:[]});
 const result=editsAfterSave(sent,newer,accepted);
 assert.equal(result.audio_tracks[0].clips[0].gainDb,-6);assert.equal(result.audio_tracks[0].previewAssetId,'new');assert.equal(result.audio_tracks[1].name,'Live');
});
