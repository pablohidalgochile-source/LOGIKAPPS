import test from 'node:test';
import assert from 'node:assert/strict';
import {CARD,cardTransform,measurePhoto,projectPoint,displayedToImage,screenPixels,calibrationStillValid} from '../src/geometry.mjs';
import {CHARTS,sizeResult,parseMeasurement,chartCsv} from '../src/sizing.mjs';
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const mmCorners=[{x:0,y:0},{x:CARD.width,y:0},{x:CARD.width,y:CARD.height},{x:0,y:CARD.height}];
const image=p=>{const z=1+.002*p.x+.001*p.y;return {x:(8*p.x+1.1*p.y+170)/z,y:(.3*p.x+7.5*p.y+230)/z};};
test('Photo calibration recovers an independent 18 mm diameter with perspective',()=>{
  const corners=mmCorners.map(image), endpoints=[{x:108,y:22},{x:126,y:22}].map(image);
  near(measurePhoto(corners,endpoints),18);
  const t=cardTransform(corners);mmCorners.forEach((p,i)=>{const r=projectPoint(t,corners[i]);near(r.x,p.x);near(r.y,p.y);});
});
test('Photo zoom and display offsets never alter the physical measurement',()=>{
  for(const zoom of [1,1.5,2,4]){
    const rect={left:32,top:80,width:800*zoom,height:600*zoom};
    const points=mmCorners.map(image),ends=[{x:107,y:26},{x:126.5,y:26}].map(image);
    const throughDisplay=p=>displayedToImage({x:rect.left+p.x*rect.width/1600,y:rect.top+p.y*rect.height/1200},rect,1600,1200);
    near(measurePhoto(points.map(throughDisplay),ends.map(throughDisplay)),19.5);
  }
});
test('Portrait reference swaps its dimensions correctly',()=>{
  const points=[{x:0,y:0},{x:539.8,y:0},{x:539.8,y:856},{x:0,y:856}];
  near(measurePhoto(points,[{x:100,y:100},{x:100,y:280}],true),18);
});
test('Rejects crossed, collinear and too-small references',()=>{
  assert.throws(()=>cardTransform([{x:0,y:0},{x:100,y:100},{x:100,y:0},{x:0,y:100}]));
  assert.throws(()=>cardTransform([{x:0,y:0},{x:30,y:0},{x:60,y:0},{x:90,y:0}]));
  assert.throws(()=>cardTransform([{x:0,y:0},{x:10,y:0},{x:10,y:6},{x:0,y:6}]));
  assert.throws(()=>cardTransform([{x:NaN,y:0},...mmCorners.slice(1)]));
});
test('Digital screen zoom changes only the display; 1:1 returns calibrated pixels',()=>{
  const ppmm=215.92/53.98;
  near(screenPixels(18,ppmm,1),72);near(screenPixels(18,ppmm,2),144);near(screenPixels(18,ppmm,1),72);
  assert.throws(()=>screenPixels(18,0));
});
test('Display environment change invalidates physical screen calibration',()=>{
  const baseline={width:390,dpr:3,orientation:0,viewportScale:1};
  assert.equal(calibrationStillValid(baseline,{...baseline}),true);
  for(const key of Object.keys(baseline)) assert.equal(calibrationStillValid(baseline,{...baseline,[key]:baseline[key]+1}),false);
  assert.equal(calibrationStillValid(null,baseline),false);
});
test('Chile 14 and 15 derive from circumference, not diameter or US sizes',()=>{
  const r14=CHARTS.reference.rows.find(r=>r.size===14),r15=CHARTS.reference.rows.find(r=>r.size===15);
  near(r14.circumference,54);near(r15.circumference,55);near(r14.diameter,54/Math.PI);near(r15.diameter,55/Math.PI);
  assert.equal(sizeResult(54/Math.PI).nearest.size,14);assert.equal(sizeResult(55/Math.PI).nearest.size,15);
  assert.equal(CHARTS.reference.rows.length,40);
});
test('Named Chile charts can give different sizes for the same diameter',()=>{
  assert.equal(sizeResult(19,'reference').nearest.size,20);
  assert.equal(sizeResult(19,'amiswey').nearest.size,18);
  near(sizeResult(19,'amiswey').circumference,19*Math.PI);
});
test('Out-of-range sizes do not silently clamp to the nearest available label',()=>{
  assert.equal(sizeResult(12).nearest,null);assert.equal(sizeResult(25).us,null);
  assert.equal(sizeResult(17.5).us.size,7); // Exactly halfway: lower reference is retained, no false exact conversion.
  assert.equal(sizeResult(NaN),null);assert.equal(sizeResult(0),null);assert.equal(sizeResult(Infinity),null);
});
test('Local decimal input rejects ambiguous or non-numeric strings',()=>{
  near(parseMeasurement('17,5'),17.5);near(parseMeasurement(' 55.2 '),55.2);
  for(const value of ['', '17abc','1e2','17,5.3','NaN','-18'])assert.equal(parseMeasurement(value),null);
});
test('Table export preserves all 40 sizes and marks calculated extensions',()=>{
  const csv=chartCsv('reference');assert.equal(csv.split('\r\n').length,41);
  assert.match(csv,/;14;17,19;54,00;/);assert.match(csv,/;40;25,46;80,00;/);assert.match(csv,/Extensión calculada/);
});
