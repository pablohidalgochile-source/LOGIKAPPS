export const CARD = {width:85.60, height:53.98};
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function screenPixels(mm, pixelsPerMm, zoom=1) {
  if (![mm,pixelsPerMm,zoom].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Escala no válida.');
  return mm*pixelsPerMm*zoom;
}
export function calibrationStillValid(saved, current) {
  return !!saved && ['width','dpr','orientation','viewportScale'].every(k=>Math.abs(saved[k]-current[k])<0.01);
}
function solve(matrix, vector) {
  const a=matrix.map((r,i)=>[...r,vector[i]]), n=vector.length;
  for(let c=0;c<n;c++) {
    let pivot=c; for(let r=c+1;r<n;r++) if(Math.abs(a[r][c])>Math.abs(a[pivot][c])) pivot=r;
    if(Math.abs(a[pivot][c])<1e-12) throw new Error('Las esquinas no permiten calcular una escala.');
    [a[c],a[pivot]]=[a[pivot],a[c]];
    const div=a[c][c]; for(let k=c;k<=n;k++) a[c][k]/=div;
    for(let r=0;r<n;r++) if(r!==c) {const f=a[r][c];for(let k=c;k<=n;k++) a[r][k]-=f*a[c][k];}
  }
  return a.map(r=>r[n]);
}
export function validQuad(points) {
  if(points.length!==4 || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return false;
  const cross=points.map((a,i)=>{const b=points[(i+1)%4],c=points[(i+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});
  // Clockwise order in image coordinates: upper-left, upper-right, lower-right, lower-left.
  return cross.every(c=>c>1e-5) && points.every((p,i)=>distance(p,points[(i+1)%4])>=12);
}
export function cardTransform(points, portrait=false) {
  if(!validQuad(points)) throw new Error('Marca las cuatro esquinas en orden, sin cruzar las líneas. Acerca la foto si la tarjeta se ve muy pequeña.');
  // Normalize the pixel domain before solving to avoid ill-conditioning on large photos.
  const origin=points[0], norm=Math.max(...points.map(p=>distance(p,origin)));
  const src=points.map(p=>({x:(p.x-origin.x)/norm,y:(p.y-origin.y)/norm}));
  const w=portrait?CARD.height:CARD.width,h=portrait?CARD.width:CARD.height;
  const dst=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  const a=[],b=[];
  src.forEach(({x,y},i)=>{const {x:u,y:v}=dst[i];a.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);b.push(u,v);});
  const H=[...solve(a,b),1];
  const denominator=p=>H[6]*((p.x-origin.x)/norm)+H[7]*((p.y-origin.y)/norm)+1;
  return {H,origin,norm,denominator};
}
export function projectPoint(transform,p) {
  const {H,origin,norm}=transform,x=(p.x-origin.x)/norm,y=(p.y-origin.y)/norm,z=H[6]*x+H[7]*y+1;
  if(!Number.isFinite(z)||Math.abs(z)<1e-6) throw new Error('La perspectiva es demasiado extrema. Toma otra foto desde arriba.');
  return {x:(H[0]*x+H[1]*y+H[2])/z,y:(H[3]*x+H[4]*y+H[5])/z};
}
export function measurePhoto(points, endpoints, portrait=false) {
  if(endpoints.length!==2) return null;
  const transform=cardTransform(points,portrait);
  const denominators=[...points,...endpoints].map(p=>transform.denominator(p));
  if(denominators.some(d=>d<=0.05)) throw new Error('No se puede medir con esta perspectiva. Repite la foto más perpendicular.');
  const mm=distance(projectPoint(transform,endpoints[0]),projectPoint(transform,endpoints[1]));
  if(!Number.isFinite(mm)||mm<=0) throw new Error('Separa los extremos de la medida.');
  return mm;
}
export function displayedToImage(point,rect,width,height) {
  return {x:Math.max(0,Math.min(width,(point.x-rect.left)*width/rect.width)),y:Math.max(0,Math.min(height,(point.y-rect.top)*height/rect.height))};
}
