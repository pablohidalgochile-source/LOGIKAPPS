'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Aperture,
  CircleDot,
  Download,
  Maximize2,
  Pause,
  Play,
  Plus,
  Radio,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Type,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';


type BrandKey = 'neon' | 'glacier' | 'gold';
type FormatKey = '16:9' | '9:16' | '1:1';


const brands = {
  neon: {
    name: 'NEÓN',
    tag: 'CLUB / HARDGROOVE',
    short: 'NE',
    accent: '#ff3bbd',
    accent2: '#dfff43',
    ink: '#190815',
  },
  glacier: {
    name: 'GLACIAR',
    tag: 'ELECTRONIC / LIVE',
    short: 'GL',
    accent: '#6df7ff',
    accent2: '#ff6534',
    ink: '#06111b',
  },
  gold: {
    name: 'DORADO',
    tag: 'LATIN / URBAN',
    short: 'DO',
    accent: '#f3c458',
    accent2: '#e93727',
    ink: '#0e0b08',
  },
} satisfies Record<BrandKey, Record<string, string>>;

const sceneNames: Record<BrandKey, string[]> = {
  neon: ['LOBA', 'PULSO', 'CROMO'],
  glacier: ['GLACIAR', 'ÓRBITA', 'SEÑAL'],
  gold: ['SELLO', 'FUEGO', 'NOCHE'],
};

export default function Home() {

  const [brand, setBrand] = useState<BrandKey>('glacier');
  const [scene, setScene] = useState(0);
  const [format, setFormat] = useState<FormatKey>('16:9');
  const [speed, setSpeed] = useState(58);
  const [intensity, setIntensity] = useState(76);
  const [grain, setGrain] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [seed, setSeed] = useState(4);
  const [headline, setHeadline] = useState('TU NOMBRE');
  const [exported, setExported] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const active = brands[brand];
  const duration = useMemo(() => `${Math.max(2.4, 10 - speed / 13)}s`, [speed]);

  const selectBrand = (next: BrandKey) => {
    setBrand(next);
    setScene(0);
    setHeadline('TU NOMBRE');
  };

  const exportFrame = () => {
    const dimensions: Record<FormatKey, [number, number]> = {
      '16:9': [1920, 1080],
      '9:16': [1080, 1920],
      '1:1': [1400, 1400],
    };
    const [width, height] = dimensions[format];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.fillStyle = active.ink;
    context.fillRect(0, 0, width, height);

    const glow = context.createRadialGradient(
      width * 0.5,
      height * 0.48,
      0,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.58,
    );
    glow.addColorStop(0, `${active.accent}${Math.round(intensity * 1.75).toString(16).padStart(2, '0')}`);
    glow.addColorStop(0.32, `${active.accent}38`);
    glow.addColorStop(1, '#00000000');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(width / 2, height / 2);
    context.rotate((seed * 17 * Math.PI) / 180);
    const rayCount = brand === 'neon' ? 24 : brand === 'gold' ? 16 : 12;
    for (let index = 0; index < rayCount; index += 1) {
      context.rotate((Math.PI * 2) / rayCount);
      context.fillStyle = index % 4 === 0 ? `${active.accent2}70` : `${active.accent}24`;
      context.fillRect(-width * 0.008, height * 0.08, width * 0.016, Math.max(width, height));
    }
    context.restore();

    context.strokeStyle = active.accent;
    context.lineWidth = Math.max(2, width * 0.002);
    context.shadowBlur = 34;
    context.shadowColor = active.accent;
    const ringCount = scene + 2;
    for (let index = 0; index < ringCount; index += 1) {
      context.beginPath();
      const radius = Math.min(width, height) * (0.18 + index * 0.13);
      context.ellipse(width / 2, height / 2, radius, radius * (brand === 'neon' ? 0.82 : 1), seed * 0.11, 0, Math.PI * 2);
      context.stroke();
    }
    context.shadowBlur = 0;

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = active.accent2;
    context.font = `700 ${Math.round(Math.min(width, height) * 0.018)}px ui-monospace, monospace`;
    context.letterSpacing = `${Math.round(width * 0.004)}px`;
    context.fillText(active.tag, width / 2, height * 0.41);

    context.fillStyle = '#f7f7f3';
    const typeSize = Math.min(width * 0.13, height * 0.18, width / Math.max(headline.length, 5) * 1.28);
    context.font = `${brand === 'gold' ? 'italic ' : ''}900 ${Math.round(typeSize)}px ${brand === 'gold' ? 'Georgia, serif' : 'Arial Black, Arial, sans-serif'}`;
    context.shadowColor = active.accent;
    context.shadowBlur = 8;
    context.fillText(headline || active.name, width / 2, height * 0.52, width * 0.84);
    context.shadowBlur = 0;

    context.fillStyle = '#ffffffbb';
    context.font = `700 ${Math.round(Math.min(width, height) * 0.015)}px ui-monospace, monospace`;
    context.fillText(`${sceneNames[brand][scene]} — 0${scene + 1}`, width / 2, height * 0.64);

    context.textAlign = 'left';
    context.fillStyle = '#ffffff88';
    context.font = `700 ${Math.round(Math.min(width, height) * 0.012)}px ui-monospace, monospace`;
    context.fillText('VJ/LAB', width * 0.04, height * 0.06);
    context.textAlign = 'right';
    context.fillStyle = active.accent2;
    context.fillText(`VJ—${String(seed).padStart(3, '0')}`, width * 0.96, height * 0.94);

    if (grain) {
      context.globalAlpha = 0.12;
      for (let index = 0; index < 4200; index += 1) {
        const shade = (index * 47 + seed * 19) % 255;
        context.fillStyle = `rgb(${shade} ${shade} ${shade})`;
        context.fillRect((index * 7919 + seed * 31) % width, (index * 104729 + seed * 43) % height, 2, 2);
      }
      context.globalAlpha = 1;
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${active.name.toLowerCase().replaceAll(' ', '-')}-${sceneNames[brand][scene].toLowerCase()}.png`;
      link.click();
      URL.revokeObjectURL(url);
      setExported(true);
      window.setTimeout(() => setExported(false), 1800);
    }, 'image/png');
  };

  return (
    <main className="studio-shell" style={{ '--accent': active.accent, '--accent-2': active.accent2 } as React.CSSProperties}>
      <header className="topbar">
        <div className="wordmark" aria-label="VJ Lab">
          <span className="mark-grid" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>VJ/LAB</span>
          <span className="edition">BETA 01</span>
        </div>
        <div className="workspace-switch"><button className="is-active">VISUALES LOCALES</button><button disabled title="El agente de logos requiere un servicio de IA y no forma parte de este pack.">LOGOS IA · NO INCLUIDO</button></div>
        <div className="top-actions">
          <span className="save-state">SESIÓN LOCAL</span>
          <Button className={`live-button ${playing ? 'is-live' : ''}`} size="sm" onClick={() => setPlaying((value) => !value)}><Radio /> {playing ? 'LIVE' : 'PAUSA'}</Button>
        </div>
      </header>

      <p className="portable-notice">Visuales y exportación PNG locales. El agente de logos con IA no está incluido. Los cambios duran esta sesión; exporta el PNG para conservar tu composición.</p>
      <section className="workspace">
        <aside className="brand-rail" aria-label="Marcas">
          <div className="rail-label">MARCAS</div>
          <div className="brand-list">
            {(Object.keys(brands) as BrandKey[]).map((key) => (
              <button
                key={key}
                className={`brand-button ${brand === key ? 'is-active' : ''}`}
                onClick={() => selectBrand(key)}
                aria-pressed={brand === key}
                title={brands[key].name}
              >
                <span>{brands[key].short}</span>
                <i style={{ background: brands[key].accent }} />
              </button>
            ))}

          </div>
        </aside>

        <>
        <section className="stage-column">
          <div className="stage-toolbar">
            <div>
              <span className="eyebrow">LIENZO ACTIVO</span>
              <h1>{active.name} <span>/ {sceneNames[brand][scene]}</span></h1>
            </div>
            <div className="format-switcher" aria-label="Formato del lienzo">
              {(['16:9', '9:16', '1:1'] as FormatKey[]).map((item) => (
                <button key={item} className={format === item ? 'is-active' : ''} onClick={() => setFormat(item)}>{item}</button>
              ))}
            </div>
          </div>

          <div className="stage-wrap">
            <div
              ref={stageRef}
              className={`visual-stage format-${format.replace(':', 'x')} brand-${brand} scene-${scene} ${playing ? 'is-playing' : 'is-paused'}`}
              style={{ '--motion-speed': duration, '--energy': intensity / 100, '--seed-turn': `${seed * 17}deg` } as React.CSSProperties}
            >
              <div className="visual-bg" />
              <div className="orbit orbit-a" />
              <div className="orbit orbit-b" />
              <div className="visual-cross cross-a" />
              <div className="visual-cross cross-b" />
              <div className="visual-type">
                <span className="visual-kicker">{active.tag}</span>
                <strong data-text={headline}>{headline}</strong>
                <span className="visual-scene">{sceneNames[brand][scene]} — 0{scene + 1}</span>
              </div>
              <div className="coordinates">VJ/LAB<br />LOCAL</div>
              <div className="frame-index">VJ—{String(seed).padStart(3, '0')}</div>
              {grain && <div className="grain" />}
              <div className="scanlines" />
            </div>
            <div className="stage-corner corner-tl" /><div className="stage-corner corner-tr" />
            <div className="stage-corner corner-bl" /><div className="stage-corner corner-br" />
          </div>

          <div className="transport">
            <div className="transport-main">
              <Button className="play-button" size="icon" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pausar visual' : 'Reproducir visual'}>
                {playing ? <Pause /> : <Play />}
              </Button>
              <div className="timecode"><span>ANIMACIÓN CSS</span><small>/ SIN AUDIO</small></div>

            </div>
            <Button variant="outline" className="tool-button" onClick={() => setSeed((value) => value + 1)}><Shuffle /> MUTAR</Button>
            <Button variant="outline" className="tool-button" onClick={() => stageRef.current?.requestFullscreen()}><Maximize2 /> PANTALLA</Button>
          </div>
        </section>

        <aside className="control-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">DIRECTOR</span><h2>Control visual</h2></div>
            <Aperture />
          </div>

          <div className="control-section">
            <label htmlFor="headline">TEXTO PRINCIPAL</label>
            <Input id="headline" value={headline} maxLength={18} onChange={(event) => setHeadline(event.target.value.toUpperCase())} className="dark-input" />
          </div>

          <div className="control-section scene-grid-section">
            <label>ESCENA</label>
            <div className="scene-grid">
              {sceneNames[brand].map((name, index) => (
                <button key={name} onClick={() => setScene(index)} className={scene === index ? 'is-active' : ''}>
                  <span className={`scene-thumb thumb-${brand}-${index}`}><i /></span>
                  <b>{name}</b><small>0{index + 1}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="control-section">
            <div className="control-row"><label>VELOCIDAD</label><output>{speed}%</output></div>
            <Slider value={[speed]} onValueChange={(value) => setSpeed(value[0])} min={10} max={100} aria-label="Velocidad" />
          </div>

          <div className="control-section">
            <div className="control-row"><label>INTENSIDAD</label><output>{intensity}%</output></div>
            <Slider value={[intensity]} onValueChange={(value) => setIntensity(value[0])} min={20} max={100} aria-label="Intensidad" />
          </div>

          <div className="control-section palette-section">
            <label>PALETA</label>
            <div className="palette-row">
              <button disabled title="Color del preset" style={{ background: active.accent }} aria-label="Color principal" />
              <button disabled title="Color del preset" style={{ background: active.accent2 }} aria-label="Color secundario" />
              <button disabled title="Color del preset" style={{ background: active.ink }} aria-label="Color de fondo" />

            </div>
          </div>

          <div className="control-section switch-row">
            <div><label htmlFor="grain-switch">GRANO ANALÓGICO</label><small>Textura sutil en vivo</small></div>
            <Switch id="grain-switch" checked={grain} onCheckedChange={setGrain} />
          </div>

          <div className="export-block">
            <Button className="export-button" onClick={exportFrame}><Download /> {exported ? 'PNG LISTO' : 'EXPORTAR PNG'}</Button>
            <span>{format === '16:9' ? '1920 × 1080' : format === '9:16' ? '1080 × 1920' : '1400 × 1400'} · PNG estático (no vídeo)</span>
          </div>
        </aside>
        </>
      </section>

      <footer className="statusbar">
        <div><CircleDot /> MOTOR <strong>LOCAL</strong></div>
        <div className="meters"><span /><span /><span /><span /></div>
        <div>PREVIEW LOCAL <i /> SIN AUDIO <i /> BETA</div>
      </footer>
    </main>
  );
}
