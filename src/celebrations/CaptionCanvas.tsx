"use client";
import { useRef } from "react";
import { fonts, type CaptionStyle } from "./caption-style";
export default function CaptionCanvas({
  src,
  caption,
  style,
  onChange,
}: {
  src: string;
  caption: string;
  style: CaptionStyle;
  onChange?: (s: CaptionStyle) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  return (
    <div className="captionCanvas" ref={ref}>
      <img src={src} alt={caption} />
      <div
        tabIndex={onChange ? 0 : undefined}
        role={onChange ? "slider" : undefined}
        aria-label={
          onChange
            ? "Caption position. Drag, or use arrow keys to move."
            : undefined
        }
        aria-valuetext={
          onChange
            ? `${Math.round(style.x)} percent from left, ${Math.round(style.y)} percent from top`
            : undefined
        }
        aria-valuenow={onChange ? style.x : undefined}
        aria-valuemin={onChange ? 0 : undefined}
        aria-valuemax={onChange ? 100 - style.width : undefined}
        className={"canvasCaption " + (onChange ? "draggable" : "")}
        style={{
          fontFamily: fonts[style.font].family,
          fontSize: style.size + "cqw",
          left: style.x + "%",
          top: style.y + "%",
          width: style.width + "%",
          color: style.color,
          textAlign: style.align,
          background: style.background ? "rgba(0,0,0,.62)" : "transparent",
          maxHeight: 100 - style.y + "%",
        }}
        onPointerDown={
          onChange
            ? (e) => {
                e.preventDefault();
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  left: style.x,
                  top: style.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }
            : undefined
        }
        onPointerMove={
          onChange
            ? (e) => {
                if (!drag.current || !ref.current) return;
                const r = ref.current.getBoundingClientRect();
                onChange({
                  ...style,
                  x: Math.max(
                    0,
                    Math.min(
                      100 - style.width,
                      drag.current.left +
                        ((e.clientX - drag.current.x) / r.width) * 100,
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      85,
                      drag.current.top +
                        ((e.clientY - drag.current.y) / r.height) * 100,
                    ),
                  ),
                });
              }
            : undefined
        }
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={
          onChange
            ? (e) => {
                const d = e.shiftKey ? 5 : 1;
                if (
                  !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                )
                  return;
                e.preventDefault();
                onChange({
                  ...style,
                  x: Math.max(
                    0,
                    Math.min(
                      100 - style.width,
                      style.x +
                        (e.key === "ArrowRight"
                          ? d
                          : e.key === "ArrowLeft"
                            ? -d
                            : 0),
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      85,
                      style.y +
                        (e.key === "ArrowDown"
                          ? d
                          : e.key === "ArrowUp"
                            ? -d
                            : 0),
                    ),
                  ),
                });
              }
            : undefined
        }
      >
        {caption}
      </div>
    </div>
  );
}
