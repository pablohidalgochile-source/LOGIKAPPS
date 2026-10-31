import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,issueCoupon,redeemCoupon,addOffer,allOffers} from '../src/model.js';

test('el canje conserva identidad y solo cambia el cupón correspondiente',()=>{
 let s=issueCoupon(initialState(),'olivo');s=issueCoupon(s,'greda');
 const code=s.coupons.find(c=>c.businessId==='olivo').code;
 const result=redeemCoupon(s,`  ${code.toLowerCase()}  `,'olivo');
 assert.equal(result.coupons.find(c=>c.businessId==='olivo').status,'Canjeado');
 assert.equal(result.coupons.find(c=>c.businessId==='greda').status,'Disponible');
 assert.equal(s.coupons.find(c=>c.businessId==='olivo').status,'Disponible');
});
test('rechaza doble canje y emisión duplicada incluso después del canje',()=>{
 let s=issueCoupon(initialState(),'olivo');const code=s.coupons[0].code;
 s=redeemCoupon(s,code,'olivo');
 assert.throws(()=>redeemCoupon(s,code,'olivo'),/ya fue canjeado/);
 assert.throws(()=>issueCoupon(s,'olivo'),/Ya tienes un cupón/);
});
test('un comercio no puede validar el cupón de otro',()=>{
 const s=issueCoupon(initialState(),'olivo');
 assert.throws(()=>redeemCoupon(s,s.coupons[0].code,'parral'),/otro comercio/);
 assert.equal(s.coupons[0].status,'Disponible');
});
test('rechaza códigos inexistentes y beneficios desconocidos',()=>{
 assert.throws(()=>issueCoupon(initialState(),'fake'),/no existe/);
 assert.throws(()=>redeemCoupon(initialState(),'CSC-FAKE','olivo'),/No encontramos/);
});
test('un nuevo beneficio admite el recorrido completo de emisión y canje',()=>{
 let s=addOffer(initialState(),'greda',{title:'Taller en pareja',discount:'2 × 1',detail:'Solo martes, con reserva.'});
 const o=allOffers(s).find(o=>o.title==='Taller en pareja');
 s=issueCoupon(s,o.id);s=redeemCoupon(s,s.coupons[0].code,'greda');
 assert.equal(s.coupons[0].discount,'2 × 1');assert.equal(s.coupons[0].status,'Canjeado');
});
test('los datos persisten en un ciclo JSON sin perder el estado de canje',()=>{
 let s=issueCoupon(initialState(),'olivo');s=redeemCoupon(s,s.coupons[0].code,'olivo');
 const restored=JSON.parse(JSON.stringify(s));
 assert.throws(()=>redeemCoupon(restored,restored.coupons[0].code,'olivo'),/ya fue canjeado/);
});
test('rechaza beneficios vacíos y comercios inválidos',()=>{
 assert.throws(()=>addOffer(initialState(),'olivo',{title:'  ',discount:'10%',detail:'Lunes'}),/Completa/);
 assert.throws(()=>addOffer(initialState(),'fake',{title:'Oferta',discount:'10%',detail:'Lunes'}),/inválido/);
});
