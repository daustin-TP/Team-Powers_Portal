import { useRef, useState, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";

export default function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(Boolean(value));
  const [hasInk, setHasInk] = useState(Boolean(value));

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(event.pointerId);
    const ctx = canvas.getContext("2d")!;
    const next = point(event);
    ctx.beginPath();
    ctx.moveTo(next.x, next.y);
    drawing.current = true;
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const next = point(event);
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#102b47";
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    inked.current = true;
    setHasInk(true);
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (inked.current) onChange(event.currentTarget.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setHasInk(false);
    onChange("");
  };

  return <div className="signature-pad">
    <div><strong>{label}</strong><button type="button" className="button text" onClick={clear} disabled={!hasInk}><RotateCcw size={14} />Clear</button></div>
    <canvas ref={canvasRef} width={800} height={220} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} aria-label={`${label} drawing area`} />
    <small>Sign inside the box using a finger, stylus, or mouse.</small>
  </div>;
}
