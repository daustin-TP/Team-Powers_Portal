import { fonts, type CaptionStyle } from "./caption-style";
export async function renderSlide(
  photo: Blob,
  caption: string,
  style: CaptionStyle,
): Promise<Blob> {
  const url = URL.createObjectURL(photo);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw Error("This photo could not be opened.");
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Photo rendering is unavailable in this browser.");
    ctx.fillStyle = "#101914";
    ctx.fillRect(0, 0, 1920, 1080);
    const scale = Math.min(
        1920 / image.naturalWidth,
        1080 / image.naturalHeight,
      ),
      w = image.naturalWidth * scale,
      h = image.naturalHeight * scale;
    ctx.drawImage(image, (1920 - w) / 2, (1080 - h) / 2, w, h);
    const size = (style.size / 100) * 1920,
      padX = 1920 * 0.018,
      padY = 1920 * 0.012,
      lineHeight = size * 1.15;
    const x = (style.x / 100) * 1920,
      y = (style.y / 100) * 1080,
      boxWidth = (style.width / 100) * 1920;
    ctx.font = `700 ${size}px ${fonts[style.font].family}`;
    const lines = wrapCaption(
      caption,
      boxWidth - 2 * padX,
      (s) => ctx.measureText(s).width,
    );
    const height = lines.length * lineHeight + padY * 2;
    if (y + height > 1080)
      throw Error(
        "The caption runs below the slide. Move it up, reduce the text size, or shorten it.",
      );
    if (style.background) {
      ctx.fillStyle = "rgba(0,0,0,.62)";
      ctx.fillRect(x, y, boxWidth, height);
    }
    ctx.fillStyle = style.color;
    ctx.textBaseline = "top";
    ctx.textAlign = style.align;
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    const tx =
      style.align === "center"
        ? x + boxWidth / 2
        : style.align === "right"
          ? x + boxWidth - padX
          : x + padX;
    lines.forEach((line, i) =>
      ctx.fillText(line, tx, y + padY + i * lineHeight),
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("Could not create the slide."))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function wrapCaption(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && measure(line + " " + word) <= width) {
        line += " " + word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      // Split a long unbroken word by Unicode code points so it cannot overflow.
      for (const char of word) {
        if (line && measure(line + char) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
