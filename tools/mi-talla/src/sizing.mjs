// Physical measurements remain the source of truth. Size charts are named references,
// not a universal national standard. Circumferences here are calculated with Math.PI.
export const SOURCES = [
  { name: 'Joyería CS · escala local y europea', url: 'https://www.joyeriacs.cl/wp-content/uploads/2023/10/guia-medidas.pdf' },
  { name: 'Goia · tabla Chile', url: 'https://goia.cl/pages/tabla-talla-anillo-chile' },
  { name: 'CBC Jewelry · tabla propia', url: 'https://cbcjewelry.cl/pages/guia-talla-anillos' },
  { name: 'Amiswey · tabla propia', url: 'https://www.amisweyjoyas.cl/pages/guia-de-tallas-de-anillos' },
  { name: 'Tiffany · referencia USA 4 a 13', url: 'https://media.tiffany.com/is/content/Tiffany/Tiffany_Ring_Size_Guide' },
  { name: 'ISO/IEC 7810 · tarjetas ID-1', url: 'https://www.iso.org/standard/70483.html' },
];
const cbcDiameters = [14.6,14.9,15.2,15.6,15.9,16.2,16.6,16.9,17.1,17.5,17.8,18.1,18.5,18.8,19.1,19.4,19.7,20,20.4,20.7,21];
const amisweyDiameters = [14.9,15.7,16.5,17.3,18.2,19,19.8,20.6,21.4];
const usDiameters = [14.9,15.3,15.7,16.1,16.5,16.9,17.3,17.7,18.1,18.5,18.9,19.4,19.8,20.2,20.6,21,21.4,21.8,22.2];
export const US_ROWS = usDiameters.map((diameter, i) => ({ size: 4+i/2, diameter, circumference: diameter*Math.PI }));
export const CHARTS = {
  reference: {
    name: 'Chile · referencia por circunferencia', shortName: 'Referencia Chile',
    note: 'Escala de referencia: número = circunferencia en mm − 40. Coincide con la progresión publicada por Joyería CS y Goia. No es una tabla obligatoria para todas las joyerías.',
    rows: Array.from({length:40}, (_,i) => ({size:i+1, circumference:i+41, diameter:(i+41)/Math.PI, extended:i+1<3 || i+1>34})),
    source: SOURCES[0].url,
  },
  cbc: {
    name:'Chile · tabla CBC Jewelry', shortName:'CBC Jewelry',
    note:'Tallas 6 a 26 según los diámetros publicados por CBC Jewelry. La circunferencia se calcula a partir de ese diámetro.',
    rows:cbcDiameters.map((diameter,i)=>({size:i+6,diameter,circumference:diameter*Math.PI})), source:SOURCES[2].url,
  },
  amiswey: {
    name:'Chile · tabla Amiswey', shortName:'Amiswey',
    note:'Tallas pares 8 a 24 según los diámetros publicados por Amiswey. No se inventan tallas intermedias. La circunferencia se calcula a partir del diámetro.',
    rows:amisweyDiameters.map((diameter,i)=>({size:8+i*2,diameter,circumference:diameter*Math.PI})), source:SOURCES[3].url,
  },
};
export function validDiameter(value) { return Number.isFinite(value) && value >= 10 && value <= 35; }
export function parseMeasurement(value) {
  if (typeof value !== 'string' || !/^\s*\d+(?:[.,]\d+)?\s*$/.test(value)) return null;
  const n = Number(value.trim().replace(',','.'));
  return Number.isFinite(n) ? n : null;
}
export function nearestRows(diameter, rows) {
  if (!validDiameter(diameter) || diameter < rows[0].diameter-1e-8 || diameter > rows.at(-1).diameter+1e-8) return {nearest:null, lower:null, upper:null};
  const nearest = rows.reduce((a,b)=>Math.abs(b.diameter-diameter)<Math.abs(a.diameter-diameter)?b:a);
  return {nearest, lower:rows.filter(r=>r.diameter <= diameter+1e-8).at(-1)??null, upper:rows.find(r=>r.diameter >= diameter-1e-8)??null};
}
export function sizeResult(diameter, chart='reference') {
  if (!validDiameter(diameter)) return null;
  const table=CHARTS[chart]; if(!table) return null;
  return {diameter, circumference:diameter*Math.PI, euNominal:Math.round(diameter*Math.PI), ...nearestRows(diameter,table.rows), us:nearestRows(diameter,US_ROWS).nearest};
}
export const fmt=(n,digits=2)=>Number(n).toLocaleString('es-CL',{minimumFractionDigits:digits,maximumFractionDigits:digits});
export function chartCsv(chart) {
  const t=CHARTS[chart];
  return '\ufeff'+['Tabla;Talla;Diámetro interior (mm);Circunferencia (mm);USA aproximada (Tiffany);Origen', ...t.rows.map(r=>[t.shortName,r.size,fmt(r.diameter),fmt(r.circumference),nearestRows(r.diameter,US_ROWS).nearest?.size??'Fuera de tabla',r.extended?'Extensión calculada':'Referencia'].join(';'))].join('\r\n');
}
