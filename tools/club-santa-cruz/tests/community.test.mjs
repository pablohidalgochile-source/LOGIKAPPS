import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';

test('cupos, pausa y condiciones de un beneficio se conservan en el cupón',()=>{
 let s=M.addOffer(M.initialState(),'olivo',{title:'Regalo local',discount:'Regalo',detail:'Un regalo por persona.',limit:1,expires:M.futureDay(8)});const o=s.customOffers[0];
 s=M.issueCoupon(s,o.id,'ana');assert.throws(()=>M.issueCoupon(s,o.id,'tomas'),/cupos/);
 s=M.toggleOffer(s,o.id,'olivo');assert.throws(()=>M.issueCoupon(s,o.id,'tomas'),/pausó/);
 s=M.redeemCoupon(s,s.coupons[0].code,'olivo');assert.equal(s.coupons[0].status,'Canjeado');assert.equal(s.coupons[0].detail,'Un regalo por persona.');assert.equal(s.stamps.length,1);
});
test('canje vencido rechazado; sellos limitados por socio, comercio y día',()=>{
 let s=M.issueCoupon(M.initialState(),'olivo');s={...s,coupons:s.coupons.map(c=>({...c,expires:'2000-01-01'}))};assert.throws(()=>M.redeemCoupon(s,s.coupons[0].code,'olivo'),/vencido/);
 s=M.awardStamp(s,'sc-1001','olivo');assert.throws(()=>M.awardStamp(s,'SC-1001','olivo'),/ya entregó/);
 s=M.awardStamp(s,'SC-1001','greda');s=M.awardStamp(s,'SC-1002','olivo');assert.equal(s.stamps.length,3);assert.throws(()=>M.awardStamp(s,'SC-no','olivo'),/No encontramos/);
});
test('un comercio nuevo puede publicar y canjear su beneficio',()=>{
 let s=M.saveBusiness(M.initialState(),{name:'Mi negocio',category:'Servicios',mode:'A domicilio',tag:'Arreglos',needs:'Aliados',address:'Centro'});const b=s.customBusinesses[0];
 s=M.addOffer(s,b.id,{title:'Diagnóstico',discount:'Gratis',detail:'Una visita de prueba.'});s=M.issueCoupon(s,s.customOffers[0].id);assert.throws(()=>M.redeemCoupon(s,s.coupons[0].code,'olivo'),/otro comercio/);s=M.redeemCoupon(s,s.coupons[0].code,b.id);assert.equal(s.stamps[0].businessId,b.id);
});
test('una contraoferta exige nueva aceptación y ambas partes confirman sus aportes',()=>{
 let s=M.initialState();const p=s.proposals[0];assert.throws(()=>M.respondProposal(s,p.id,'greda','accept'),/respuesta/);assert.throws(()=>M.respondProposal(s,p.id,'parral','accept'),/parte/);
 s=M.respondProposal(s,p.id,'olivo','counter',{...p,offer:'Otra vitrina',request:'Dos recomendaciones'});assert.equal(s.proposals[0].awaiting,'greda');assert.deepEqual(s.proposals[0].accepted,['olivo']);
 assert.throws(()=>M.respondProposal(s,p.id,'olivo','accept'),/respuesta/);s=M.respondProposal(s,p.id,'greda','accept');assert.equal(s.proposals[0].status,'Activa');
 s=M.respondProposal(s,p.id,'olivo','fulfill');assert.equal(s.proposals[0].status,'Activa');assert.throws(()=>M.respondProposal(s,p.id,'olivo','fulfill'),/pendiente/);s=M.respondProposal(s,p.id,'greda','fulfill');assert.equal(s.proposals[0].status,'Completada');assert.equal(s.proposals[0].history.length,5);
});
test('propuestas inválidas, plazos y retiro',()=>{
 let s=M.initialState();assert.throws(()=>M.createProposal(s,'olivo',{to:'olivo'}),/otro comercio/);
 assert.throws(()=>M.createProposal(s,'olivo',{to:'greda',title:'Idea',offer:'Uno',request:'Dos',start:M.futureDay(5),end:M.futureDay(1)}),/fechas/);
 s=M.respondProposal(s,'incoming-1','greda','withdraw');assert.equal(s.proposals[0].status,'Retirada');assert.throws(()=>M.respondProposal(s,'incoming-1','olivo','accept'),/respuesta/);
});
test('apoderado inscribe, llena cupo y la cancelación promueve al siguiente',()=>{
 let s=M.initialState();s=M.enroll(s,'futbol','ana','camila',true);s=M.enroll(s,'futbol','ana','diego',true);
 assert.equal(s.registrations.find(r=>r.participantId==='camila').status,'Confirmada');assert.equal(s.registrations.find(r=>r.participantId==='diego').status,'En espera');
 assert.throws(()=>M.enroll(s,'futbol','ana','diego',true),/ya está/);const r=s.registrations.find(r=>r.participantId==='camila');assert.throws(()=>M.cancelRegistration(s,r.id,'tomas'),/No puedes/);
 s=M.cancelRegistration(s,r.id,'ana');assert.equal(s.registrations.find(r=>r.participantId==='diego').status,'Confirmada');assert.equal(M.confirmedCount(s,'futbol'),3);assert.equal(s.notices[0].memberId,'ana');
});
test('edad, apoderado y consentimiento se comprueban antes de inscribir',()=>{
 const s=M.initialState();assert.throws(()=>M.enroll(s,'futbol','ana','ana',true),/edades/);assert.throws(()=>M.enroll(s,'futbol','ana','lucas',true),/familia/);assert.throws(()=>M.enroll(s,'futbol','ana','camila',false),/Confirma/);
});
test('asistencia solo por organizador y para inscripción confirmada',()=>{
 let s=M.enroll(M.initialState(),'futbol','ana','camila',true);s=M.enroll(s,'futbol','ana','diego',true);const r=s.registrations.find(r=>r.participantId==='camila'),wait=s.registrations.find(r=>r.participantId==='diego');
 assert.throws(()=>M.markAttendance(s,r.id,'greda'),/organizador/);assert.throws(()=>M.markAttendance(s,wait.id,'olivo'),/organizador/);
 s=M.markAttendance(s,r.id,'olivo');assert.equal(s.registrations.find(x=>x.id===r.id).attendance,true);assert.throws(()=>M.cancelRegistration(s,r.id,'ana'),/no se puede/);
});
test('cancelar actividad libera compromisos, conserva registros y avisa',()=>{
 let s=M.enroll(M.initialState(),'futbol','ana','camila',true);s=M.toggleCommitment(s,'futbol','agua','member:ana');assert.throws(()=>M.cancelEvent(s,'futbol','greda'),/organizador/);
 s=M.cancelEvent(s,'futbol','olivo');assert.equal(s.events.find(e=>e.id==='futbol').status,'Cancelada');assert.equal(s.registrations.filter(r=>r.eventId==='futbol'&&r.status!=='Cancelada').length,0);assert.equal(s.commitments[0].status,'Cancelado');assert.equal(s.notices.length,2);assert.throws(()=>M.enroll(s,'futbol','ana','diego',true),/inscripciones/);assert.throws(()=>M.toggleCommitment(s,'futbol','agua','member:ana'),/disponible/);
});
test('aportes limitados, liberables y con confirmación de cumplimiento',()=>{
 let s=M.toggleCommitment(M.initialState(),'futbol','cancha','member:ana');assert.throws(()=>M.toggleCommitment(s,'futbol','cancha','business:greda'),/colaboradores/);
 s=M.toggleCommitment(s,'futbol','cancha','member:ana');s=M.toggleCommitment(s,'futbol','cancha','business:greda');const c=s.commitments.at(-1);assert.throws(()=>M.fulfillCommitment(s,c.id,'member:ana'),/pendiente/);s=M.fulfillCommitment(s,c.id,'business:greda');assert.equal(s.commitments.at(-1).status,'Cumplido');
});
test('nuevo encuentro y familiar participan en el mismo flujo',()=>{
 let s=M.addFamily(M.initialState(),'ana',{name:'Paz',age:7});const kid=s.family.at(-1);s=M.createEvent(s,'greda',{title:'Taller',description:'Materiales incluidos',place:'Patio de prueba',date:M.futureDay(4),time:'15:00',capacity:2,minAge:6,maxAge:12,task:'Llevar papel',taskSlots:1});const e=s.events[0];
 s=M.enroll(s,e.id,'ana',kid.id,true);assert.equal(s.registrations.at(-1).status,'Confirmada');assert.equal(e.tasks.length,1);
 assert.throws(()=>M.createEvent(s,'greda',{...e,date:'2000-01-01'}),/futura/);
});
test('la migración preserva cupones, favoritos, campañas y acuerdos previos',()=>{
 const old={favorites:['olivo'],coupons:[{id:'a',code:'CSC-A',offerId:'olivo',businessId:'olivo',status:'Disponible'}],customOffers:[],proposals:[{id:'old',from:'greda',to:'olivo',type:'Promoción',message:'Una idea anterior',status:'Activa'}],campaigns:[{id:'c',title:'Mi anuncio'}]};
 const s=M.migrateState(JSON.parse(JSON.stringify(old)));assert.equal(s.version,2);assert.equal(s.coupons[0].memberId,'ana');assert.equal(s.favorites[0].offerId,'olivo');assert.equal(s.proposals[0].accepted.length,2);assert.equal(s.campaigns[0].title,'Mi anuncio');assert.equal(s.events.length,4);
});

test('las actividades respetan la edad de socios adultos y jóvenes',()=>{
 let s=M.initialState();
 assert.throws(()=>M.enroll(s,'greda-taller','ana','ana',true),/edades/);
 s=M.enroll(s,'greda-taller','elena','elena',true);
 s=M.enroll(s,'musica','nico','nico',true);
 assert.equal(s.registrations.at(-2).status,'Confirmada');
 assert.equal(s.registrations.at(-1).name,'Nico');
});
