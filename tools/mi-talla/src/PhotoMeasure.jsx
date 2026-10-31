import React,{useState,useRef,useEffect} from 'react';
import {CARD,cardTransform,measurePhoto,displayedToImage} from './geometry.mjs';
import {fmt} from './sizing.mjs';

const demoSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#e7e5dd"/><rect x="80" y="200" width="856" height="539.8" rx="32" fill="#315b46"/><text x="140" y="300" font-family="sans-serif" font-size="32" fill="#fff">TARJETA DE EJEMPLO</text><text x="140" y="665" font-family="sans-serif" font-size="25" fill="#dceadc">85,60 × 53,98 mm</text><circle cx="1220" cy="480" r="110" fill="#b89a58"/><circle cx="1220" cy="480" r="90" fill="#e7e5dd"/><text x="1050" y="670" font-family="sans-serif" font-size="28" fill="#25392c">Interior: 18 mm</text><text x="80" y="890" font-family="sans-serif" font-size="23" fill="#4f6254">Ejemplo digital. No es una medición de tu anillo.</text></svg>`;
export default function PhotoMeasure({onMeasurement}) {
  const [photo,setPhoto]=useState(null),[points,setPoints]=useState([]),[ends,setEnds]=useState([]);
  const [portrait,setPortrait]=useState(false),[plane,setPlane]=useState(false),[zoom,setZoom]=useState(1),[error,setError]=useState('');
  const [selected,setSelected]=useState(null),[width,setWidth]=useState(600),[panMode,setPanMode]=useState(false);
  const host=useRef(null),svg=useRef(null),scrollArea=useRef(null),drag=useRef(null),loadSequence=useRef(0),fileRef=useRef(null),cameraRef=useRef(null);
  useEffect(()=>{const ro=new ResizeObserver(e=>setWidth(e[0].contentRect.width));if(host.current)ro.observe(host.current);return()=>ro.disconnect();},[]);
  useEffect(()=>()=>{if(photo?.url.startsWith('blob:'))URL.revokeObjectURL(photo.url);},[photo?.url]);
  let measurement=null,geometryError='';
  try {if(points.length===4){cardTransform(points,portrait);if(ends.length===2)measurement=measurePhoto(points,ends,portrait);}}catch(e){geometryError=e.message;}
  useEffect(()=>{onMeasurement({diameter:measurement,ready:plane&&measurement!==null,source:photo?.demo?'Ejemplo digital de 18 mm':'Foto con tarjeta',demo:!!photo?.demo});},[measurement,plane,photo?.demo,onMeasurement]);
  function loadFile(file){
    if(!file)return;
    const request=++loadSequence.current;setError('');setPoints([]);setEnds([]);setPlane(false);setPhoto(null);setZoom(1);setSelected(null);setPanMode(false);
    if(!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type)){setError('Usa una foto JPG, PNG, WebP o un formato de imagen compatible con tu navegador.');return;}
    if(file.size>25*1024*1024){setError('La foto es muy grande. Usa una de hasta 25 MB.');return;}
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{if(request!==loadSequence.current){URL.revokeObjectURL(url);return;}if(img.naturalWidth*img.naturalHeight>40e6){URL.revokeObjectURL(url);setError('Usa una foto de hasta 40 megapíxeles.');return;}setPhoto({url,width:img.naturalWidth,height:img.naturalHeight,demo:false});};
    img.onerror=()=>{URL.revokeObjectURL(url);if(request===loadSequence.current)setError('No se pudo abrir la foto. Si es HEIC, expórtala como JPG y vuelve a intentar.');};img.src=url;
  }
  function demo(){loadSequence.current++;setError('');setPortrait(false);setPlane(true);setZoom(1);setSelected(null);setPanMode(false);setPhoto({url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(demoSvg),width:1600,height:1000,demo:true});setPoints([{x:80,y:200},{x:936,y:200},{x:936,y:739.8},{x:80,y:739.8}]);setEnds([{x:1130,y:480},{x:1310,y:480}]);}
  const pointAt=e=>displayedToImage({x:e.clientX,y:e.clientY},svg.current.getBoundingClientRect(),photo.width,photo.height);
  function down(e){
    if(e.button!==0)return;
    const kind=e.target.dataset.kind,index=Number(e.target.dataset.index);
    if(panMode||(!kind&&ends.length===2)){drag.current={kind:'pan',x:e.clientX,y:e.clientY,left:scrollArea.current.scrollLeft,top:scrollArea.current.scrollTop};svg.current.setPointerCapture(e.pointerId);e.preventDefault();return;}
    if(kind){setSelected({kind,index});drag.current={kind,index};svg.current.setPointerCapture(e.pointerId);e.preventDefault();return;}
    const point=pointAt(e);
    if(points.length<4){setPoints(p=>[...p,point]);setSelected({kind:'card',index:points.length});}
    else if(!geometryError&&ends.length<2){setEnds(p=>[...p,point]);setSelected({kind:'measure',index:ends.length});}
  }
  function move(e){if(!drag.current)return;if(drag.current.kind==='pan'){scrollArea.current.scrollLeft=drag.current.left-(e.clientX-drag.current.x);scrollArea.current.scrollTop=drag.current.top-(e.clientY-drag.current.y);return;}const p=pointAt(e),{kind,index}=drag.current;(kind==='card'?setPoints:setEnds)(old=>old.map((v,i)=>i===index?p:v));}
  function nudge(dx,dy){if(!selected||!photo)return;const {kind,index}=selected;(kind==='card'?setPoints:setEnds)(old=>old.map((p,i)=>i===index?{x:Math.max(0,Math.min(photo.width,p.x+dx)),y:Math.max(0,Math.min(photo.height,p.y+dy))}:p));}
  const shownWidth=Math.max(1,width)*zoom,pointRadius=photo?12*photo.width/shownWidth:12;
  return <div className="photo-tool" ref={host}>
    <div className="section-heading"><div><span className="eyebrow">FOTO CON REFERENCIA</span><h2>Del borde al milímetro.</h2></div></div>
    <p className="muted">Fotografía la tarjeta completa y el anillo desde arriba, con buena luz. El diámetro que midas debe estar a la misma altura que la referencia.</p>
    <div className="row wrap"><button className="primary" onClick={()=>fileRef.current.click()}>Elegir foto</button><button className="secondary" onClick={()=>cameraRef.current.click()}>Usar cámara</button><input ref={fileRef} hidden type="file" accept="image/*" onChange={e=>{loadFile(e.target.files[0]);e.target.value='';}}/><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e=>{loadFile(e.target.files[0]);e.target.value='';}}/><button className="quiet" onClick={demo}>Probar ejemplo de 18 mm</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {!photo?<div className="photo-empty"><span className="empty-symbol">◎</span><strong>Tu foto se queda en este dispositivo</strong><span>No necesitas cuenta. No se sube a ningún servidor.</span></div>:<>
      <div className="photo-steps"><span className={points.length<4?'active':''}>1. Marca la tarjeta</span><span className={points.length===4&&ends.length<2?'active':''}>2. Marca el diámetro</span><span className={ends.length===2?'active':''}>3. Revisa</span></div>
      <label className="field">Posición de la tarjeta en la foto<select value={portrait?'portrait':'landscape'} onChange={e=>setPortrait(e.target.value==='portrait')}><option value="landscape">Horizontal · lado largo arriba</option><option value="portrait">Vertical · lado corto arriba</option></select></label>
      <p className="instruction" role="status">{points.length<4?`Marca la esquina ${['superior izquierda','superior derecha','inferior derecha','inferior izquierda'][points.length]} (${points.length+1} de 4). Usa el cruce imaginario de los bordes rectos, no la curva redondeada.`:ends.length<2?'Marca dos extremos opuestos del borde interior, pasando por el centro del anillo.':'Arrastra los puntos para afinar. La línea debe cruzar el centro y tocar solo el borde interior.'}</p>
      <div className="photo-toolbar"><div className="zoom-control"><button aria-label="Alejar foto" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.5))}>−</button><span>{fmt(zoom,1)}×</span><button aria-label="Acercar foto" disabled={zoom>=4} onClick={()=>setZoom(z=>Math.min(4,z+.5))}>+</button></div><button className="secondary" aria-pressed={panMode} onClick={()=>setPanMode(v=>!v)}>{panMode?'Volver a marcar':'Mover foto'}</button><button className="quiet" onClick={()=>{setZoom(1);scrollArea.current.scrollLeft=0;scrollArea.current.scrollTop=0;}}>Ver foto completa</button></div>
      <div className="photo-scroll" ref={scrollArea}><div className="photo-image" style={{width:shownWidth,height:photo.height/photo.width*shownWidth}}>
        <img src={photo.url} alt={photo.demo?'Ejemplo digital de un anillo de 18 mm y tarjeta de referencia':'Foto local para medir un anillo'} draggable="false"/>
        <svg ref={svg} viewBox={`0 0 ${photo.width} ${photo.height}`} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} aria-label="Editor de referencia y diámetro">
          {points.length>1&&<polyline points={points.concat(points.length===4?[points[0]]:[]).map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#92ffe0" strokeWidth={pointRadius/5} pointerEvents="none"/>}
          {ends.length===2&&<line x1={ends[0].x} y1={ends[0].y} x2={ends[1].x} y2={ends[1].y} stroke="#ffda7c" strokeWidth={pointRadius/4} pointerEvents="none"/>}
          {[{kind:'card',arr:points},{kind:'measure',arr:ends}].flatMap(({kind,arr})=>arr.map((p,i)=><g key={kind+i}><circle data-kind={kind} data-index={i} cx={p.x} cy={p.y} r={pointRadius} fill={kind==='card'?'#234e3d':'#674b14'} stroke={selected?.kind===kind&&selected.index===i?'white':kind==='card'?'#92ffe0':'#ffda7c'} strokeWidth={pointRadius/5}/><text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={pointRadius} pointerEvents="none">{kind==='card'?i+1:['A','B'][i]}</text></g>))}
        </svg>
      </div></div>
      <div className="row wrap between"><span className="caption">{photo.demo?'EJEMPLO DIGITAL · no mide tu anillo':'Zoom de inspección · la medida no cambia'}</span><button className="quiet" onClick={()=>{setEnds([]);setSelected(null);}}>Repetir diámetro</button><button className="quiet" onClick={()=>{setPoints([]);setEnds([]);setSelected(null);}}>Repetir tarjeta</button></div>
      {points.length>0&&<label className="field point-picker">Ajustar un punto<select value={selected?selected.kind+':'+selected.index:''} onChange={e=>{if(!e.target.value){setSelected(null);return;}const [kind,index]=e.target.value.split(':');setSelected({kind,index:Number(index)});}}><option value="">Elige un punto</option>{points.map((_,i)=><option key={i} value={'card:'+i}>Tarjeta · esquina {i+1}</option>)}{ends.map((_,i)=><option key={'m'+i} value={'measure:'+i}>Diámetro · punto {['A','B'][i]}</option>)}</select></label>}
      {selected&&<div className="nudge"><span>Ajustar punto {selected.kind==='card'?selected.index+1:['A','B'][selected.index]}</span><button aria-label="Mover punto a la izquierda" onClick={()=>nudge(-1,0)}>←</button><button aria-label="Mover punto arriba" onClick={()=>nudge(0,-1)}>↑</button><button aria-label="Mover punto abajo" onClick={()=>nudge(0,1)}>↓</button><button aria-label="Mover punto a la derecha" onClick={()=>nudge(1,0)}>→</button></div>}
      {geometryError&&<p className="error" role="alert">{geometryError}</p>}
      <label className="check"><input type="checkbox" checked={plane} onChange={e=>setPlane(e.target.checked)}/><span>Confirmo que la referencia y el diámetro están en el mismo plano. No estoy midiendo el ancho de un dedo.</span></label>
      <p className="caption">Referencia ID-1: {fmt(CARD.width)} × {fmt(CARD.height)} mm. Una tarjeta bajo un dedo no permite deducir su circunferencia. Usa la opción «Tengo una medida» para introducir un contorno medido físicamente.</p>
    </>}
  </div>;
}
