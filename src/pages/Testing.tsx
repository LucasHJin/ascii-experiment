import { useState } from 'react';
import AsciiVideoWebGL from '../components/AsciiVideoWebGL';

const label: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: 2 };
const sectionStyle: React.CSSProperties = { borderBottom: '1px solid #444', paddingBottom: 4, marginTop: 14, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 };

function Slider({ name, value, min, max, step, onChange }: {
    name: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void;
}) {
    return (
        <div style={{ marginBottom: 8 }}>
            <div style={label}>
                <span>{name}</span>
                <span style={{ color: '#aaa' }}>{value % 1 === 0 ? value : value.toFixed(2)}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#fff' }} />
        </div>
    );
}

function Check({ name, checked, onChange }: { name: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: '#fff' }} />
            {name}
        </label>
    );
}

function Testing() {
    const [numCols, setNumCols] = useState(80);
    const [brightness, setBrightness] = useState(1.4);
    const [saturation, setSaturation] = useState(1.8);
    const [bgOpacity, setBgOpacity] = useState(0.3);
    const [colored, setColored] = useState(true);

    const [revealEnabled, setRevealEnabled] = useState(false);
    const [revealType, setRevealType] = useState<'diagonal' | 'radial' | 'random'>('diagonal');
    const [revealDuration, setRevealDuration] = useState(0.4);

    const [mouseEnabled, setMouseEnabled] = useState(true);
    const [mouseRadius, setMouseRadius] = useState(0.08);
    const [mouseBrightness, setMouseBrightness] = useState(2.0);
    const [trailLen, setTrailLen] = useState(15);
    const [trailDecay, setTrailDecay] = useState(10);
    const [trailDuration, setTrailDuration] = useState(2.0);

    const [clickEnabled, setClickEnabled] = useState(true);
    const [clickBrightness, setClickBrightness] = useState(1.1);
    const [clickSpeed, setClickSpeed] = useState(2.0);

    const mouseEffectProp = mouseEnabled ? { radius: mouseRadius, brightness: mouseBrightness, trailLen, trailDecay, trailDuration } : false;
    const clickEffectProp = clickEnabled ? { brightness: clickBrightness, speed: clickSpeed } : false;
    const revealEffectProp = revealEnabled ? { type: revealType, duration: revealDuration } : false;

    return (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#000' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <AsciiVideoWebGL
                    src="/m3.mp4"
                    numCols={numCols}
                    brightness={brightness}
                    saturation={saturation}
                    bgOpacity={bgOpacity}
                    colored={colored}
                    revealEffect={revealEffectProp}
                    mouseEffect={mouseEffectProp}
                    clickEffect={clickEffectProp}
                />
            </div>

            <div style={{
                width: 260,
                flexShrink: 0,
                background: 'rgba(0,0,0,0.85)',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 12,
                padding: '12px 14px',
                overflowY: 'auto',
                borderLeft: '1px solid #333',
            }}>
                <div style={sectionStyle}>GENERAL</div>
                <Slider name="numCols" value={numCols} min={20} max={200} step={1} onChange={setNumCols} />
                <Slider name="brightness" value={brightness} min={0} max={2} step={0.01} onChange={setBrightness} />
                <Slider name="saturation" value={saturation} min={0} max={3} step={0.01} onChange={setSaturation} />
                <Slider name="bgOpacity" value={bgOpacity} min={0} max={1} step={0.01} onChange={setBgOpacity} />
                <Check name="colored" checked={colored} onChange={setColored} />

                <div style={sectionStyle}>REVEAL EFFECT</div>
                <Check name="enabled" checked={revealEnabled} onChange={setRevealEnabled} />
                {revealEnabled && <>
                    <div style={{ marginBottom: 8 }}>
                        <div style={label}><span>type</span></div>
                        <label style={{ marginRight: 12, cursor: 'pointer' }}>
                            <input type="radio" name="revealType" value="diagonal" checked={revealType === 'diagonal'} onChange={() => setRevealType('diagonal')} style={{ marginRight: 4 }} />
                            diagonal
                        </label>
                        <label style={{ cursor: 'pointer' }}>
                            <input type="radio" name="revealType" value="radial" checked={revealType === 'radial'} onChange={() => setRevealType('radial')} style={{ marginRight: 4 }} />
                            radial
                        </label>
                        <label style={{ cursor: 'pointer' }}>
                            <input type="radio" name="revealType" value="random" checked={revealType === 'random'} onChange={() => setRevealType('random')} style={{ marginRight: 4 }} />
                            random
                        </label>
                    </div>
                    <Slider name="duration" value={revealDuration} min={0.1} max={4} step={0.1} onChange={setRevealDuration} />
                </>}

                <div style={sectionStyle}>MOUSE EFFECT</div>
                <Check name="enabled" checked={mouseEnabled} onChange={setMouseEnabled} />
                {mouseEnabled && <>
                    <Slider name="radius" value={mouseRadius} min={0.03} max={0.2} step={0.01} onChange={setMouseRadius} />
                    <Slider name="brightness" value={mouseBrightness} min={0.2} max={5} step={0.1} onChange={setMouseBrightness} />
                    <Slider name="trailLen" value={trailLen} min={0} max={30} step={1} onChange={setTrailLen} />
                    <Slider name="trailDecay" value={trailDecay} min={1} max={15} step={0.5} onChange={setTrailDecay} />
                    <Slider name="trailDuration" value={trailDuration} min={0.1} max={4} step={0.1} onChange={setTrailDuration} />
                </>}

                <div style={sectionStyle}>CLICK EFFECT</div>
                <Check name="enabled" checked={clickEnabled} onChange={setClickEnabled} />
                {clickEnabled && <>
                    <Slider name="brightness" value={clickBrightness} min={1.05} max={2} step={0.05} onChange={setClickBrightness} />
                    <Slider name="speed" value={clickSpeed} min={0.5} max={4} step={0.1} onChange={setClickSpeed} />
                </>}
            </div>
        </div>
    );
}

export default Testing;
