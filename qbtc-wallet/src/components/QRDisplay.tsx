import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRDisplayProps {
  value: string;
  size?: number;
}

export default function QRDisplay({ value, size = 200 }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [value, size]);

  return (
    <div className="flex justify-center">
      <div className="rounded-xl overflow-hidden border-4 border-white">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
