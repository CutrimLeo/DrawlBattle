import { useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Eraser, Pencil, RotateCcw, RotateCw, Trash2, Circle } from 'lucide-react';
import type { Point, RoomSnapshot, Stroke } from '../../../shared/types';
import { action, streamStroke } from '../state/game';
const colors = ['#232738', '#FFFFFF', '#EB6C66', '#E99B54', '#F1CF59', '#B5D46F', '#64B8A5', '#6BA8E9', '#9E83DB', '#E793BC'];
export function DrawingCanvas({ room, canDraw, overlay }: { room: RoomSnapshot; canDraw: boolean; overlay?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const active = useRef<Stroke | null>(null);
  const lastSent = useRef(0);
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(7);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const strokes = useRef(room.strokes);
  strokes.current = room.strokes;
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const draw = (stroke: Stroke) => {
      if (!stroke.points.length) return;
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#FFFFFF' : stroke.color;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = stroke.brushSize * canvas.width / 1000;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const first = stroke.points[0];
      if (stroke.points.length === 1) {
        ctx.beginPath(); ctx.arc(first.x * canvas.width, first.y * canvas.height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return;
      }
      ctx.beginPath(); ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
      ctx.stroke();
    };
    for (const stroke of strokes.current) { if (stroke.id !== active.current?.id) draw(stroke); }
    if (active.current) draw(active.current);
  };
  useEffect(() => { render(); }, [room.strokes]);
  useEffect(() => { if (!canDraw) { active.current = null; render(); } }, [canDraw, room.turn]);
  function position(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  }
  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { id: uuid(), color, brushSize: tool === 'eraser' ? size * 3 : size, tool, points: [position(event)] };
    streamStroke(active.current); lastSent.current = Date.now(); render();
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!active.current || !canDraw) return;
    const point = position(event); const previous = active.current.points.at(-1)!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.001) return;
    if (active.current.points.length >= 2000) {
      streamStroke(active.current);
      active.current = { ...active.current, id: uuid(), points: [previous] };
    }
    active.current.points.push(point); render();
    if (Date.now() - lastSent.current > 35) { streamStroke(active.current); lastSent.current = Date.now(); }
  }
  function up() {
    if (active.current) {
      streamStroke(active.current);
      const value = active.current;
      const index = strokes.current.findIndex((stroke) => stroke.id === value.id);
      strokes.current = index >= 0 ? strokes.current.map((stroke) => stroke.id === value.id ? value : stroke) : [...strokes.current, value];
      active.current = null; render();
    }
  }
  return <div className="drawing-section">
    <div className={'canvas-wrap ' + (canDraw ? 'can-draw' : '')}>
      <canvas ref={canvasRef} data-testid="drawing-canvas" aria-label={canDraw ? 'Tela de desenho. Desenhe usando o mouse ou o toque.' : 'Desenho da rodada em tempo real'} width={1200} height={800} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {overlay && <div className="canvas-overlay">{overlay}</div>}
      {canDraw && <div className="canvas-tag"><Pencil size={12} /> A tela é sua!</div>}
    </div>
    <div className={'drawing-tools ' + (!canDraw ? 'read-only' : '')}>
      <div className="tool-group">
        <button type="button" className={'tool-button ' + (tool === 'pencil' ? 'active' : '')} title="Lápis" aria-label="Lápis" aria-pressed={tool === 'pencil'} disabled={!canDraw} onClick={() => setTool('pencil')}><Pencil size={18} /></button>
        <button type="button" className={'tool-button ' + (tool === 'eraser' ? 'active' : '')} title="Borracha" aria-label="Borracha" aria-pressed={tool === 'eraser'} disabled={!canDraw} onClick={() => setTool('eraser')}><Eraser size={18} /></button>
      </div>
      <div className="palette" role="group" aria-label="Cores do desenho">{colors.map((value) => <button type="button" key={value} className={'color-swatch ' + (color === value ? 'active' : '')} style={{ backgroundColor: value }} disabled={!canDraw} aria-label={'Cor ' + value} aria-pressed={color === value} onClick={() => { setColor(value); setTool('pencil'); }} />)}</div>
      <label className="brush-size"><Circle size={size + 3} fill="currentColor" /><select aria-label="Espessura do pincel" value={size} disabled={!canDraw} onChange={(event) => setSize(Number(event.target.value))}><option value={3}>Fino</option><option value={7}>Médio</option><option value={14}>Grosso</option></select></label>
      <div className="tool-group history-tools">
        <button type="button" className="tool-button" title="Desfazer" aria-label="Desfazer último traço" disabled={!canDraw || !room.canUndo} onClick={() => void action('draw:undo')}><RotateCcw size={18} /></button>
        <button type="button" className="tool-button" title="Refazer" aria-label="Refazer último traço" disabled={!canDraw || !room.canRedo} onClick={() => void action('draw:redo')}><RotateCw size={18} /></button>
        <button type="button" className="tool-button" title="Limpar desenho" aria-label="Limpar desenho" disabled={!canDraw || !room.strokes.length} onClick={() => void action('draw:clear')}><Trash2 size={18} /></button>
      </div>
    </div>
  </div>;
}
