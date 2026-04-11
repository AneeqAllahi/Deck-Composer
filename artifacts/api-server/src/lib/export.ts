import PptxGenJS from "pptxgenjs";
import type { BrandProfile, SlideData } from "@workspace/db";

type Slide = SlideData;

function hexToPercent(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function pptxColor(hex: string): string {
  return hex.replace("#", "").toUpperCase();
}

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

const SLIDE_W = 10;
const SLIDE_H = 5.625;

export async function exportDeckToPptx(
  deckTitle: string,
  slides: Slide[],
  brand: BrandProfile,
  logoBuffer?: Buffer,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deckTitle;
  pptx.author = "DeckAI";

  const bgColor = pptxColor(brand.primaryColor);
  const textColor = isLight(brand.primaryColor) ? "1E293B" : "FFFFFF";
  const accentColor = pptxColor(brand.accentColor);
  const secondaryColor = pptxColor(brand.secondaryColor);

  const headingFont = brand.headingFont || "Calibri";
  const bodyFont = brand.bodyFont || "Calibri";

  const densityPadding = brand.density === "spacious" ? 0.7 : brand.density === "dense" ? 0.3 : 0.5;

  for (const slide of slides) {
    const pSlide = pptx.addSlide();

    pSlide.background = { color: bgColor };

    if (logoBuffer) {
      try {
        const logoData = logoBuffer.toString("base64");
        pSlide.addImage({
          data: `image/png;base64,${logoData}`,
          x: SLIDE_W - 1.2,
          y: 0.1,
          w: 0.9,
          h: 0.35,
          sizing: { type: "contain", w: 0.9, h: 0.35 },
        });
      } catch {
        // Skip logo if it can't be added
      }
    }

    switch (slide.layoutType) {
      case "title": {
        pSlide.addText(slide.title, {
          x: densityPadding,
          y: SLIDE_H * 0.3,
          w: SLIDE_W - densityPadding * 2,
          h: 1.5,
          fontSize: 40,
          bold: true,
          color: textColor,
          fontFace: headingFont,
          align: "center",
          wrap: true,
        });
        if (slide.body) {
          pSlide.addText(slide.body, {
            x: densityPadding,
            y: SLIDE_H * 0.62,
            w: SLIDE_W - densityPadding * 2,
            h: 0.8,
            fontSize: 18,
            color: textColor,
            fontFace: bodyFont,
            align: "center",
            transparency: 30,
            wrap: true,
          });
        }
        pSlide.addShape(pptx.ShapeType.rect, {
          x: SLIDE_W / 2 - 1,
          y: SLIDE_H * 0.75,
          w: 2,
          h: 0.05,
          fill: { color: accentColor },
        });
        break;
      }

      case "section": {
        pSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 0.08,
          h: SLIDE_H,
          fill: { color: accentColor },
        });
        pSlide.addText(slide.title, {
          x: 0.5,
          y: SLIDE_H * 0.35,
          w: SLIDE_W - 1,
          h: 1.2,
          fontSize: 32,
          bold: true,
          color: textColor,
          fontFace: headingFont,
          wrap: true,
        });
        break;
      }

      case "text": {
        pSlide.addText(slide.title, {
          x: densityPadding,
          y: densityPadding,
          w: SLIDE_W - densityPadding * 2,
          h: 0.7,
          fontSize: 22,
          bold: true,
          color: textColor,
          fontFace: headingFont,
          wrap: true,
        });

        pSlide.addShape(pptx.ShapeType.rect, {
          x: densityPadding,
          y: densityPadding + 0.75,
          w: 0.06,
          h: 0.06,
          fill: { color: accentColor },
        });

        const bullets = slide.bulletPoints && slide.bulletPoints.length > 0
          ? slide.bulletPoints
          : slide.body ? [slide.body] : [];

        const bulletObjs = bullets.map((b) => ({
          text: b,
          options: {
            bullet: { type: "bullet" as const },
            fontSize: 14,
            color: textColor,
            fontFace: bodyFont,
            paraSpaceBefore: 6,
          },
        }));

        if (bulletObjs.length > 0) {
          pSlide.addText(bulletObjs, {
            x: densityPadding,
            y: densityPadding + 0.9,
            w: SLIDE_W - densityPadding * 2,
            h: SLIDE_H - densityPadding * 2 - 0.9,
            valign: "top",
            wrap: true,
          });
        }
        break;
      }

      case "columns": {
        pSlide.addText(slide.title, {
          x: densityPadding,
          y: densityPadding,
          w: SLIDE_W - densityPadding * 2,
          h: 0.7,
          fontSize: 22,
          bold: true,
          color: textColor,
          fontFace: headingFont,
          wrap: true,
        });

        const colW = (SLIDE_W - densityPadding * 2 - 0.3) / 2;
        const colY = densityPadding + 0.9;
        const colH = SLIDE_H - densityPadding - colY;

        pSlide.addShape(pptx.ShapeType.rect, {
          x: densityPadding,
          y: colY - 0.1,
          w: colW,
          h: colH + 0.1,
          fill: { color: secondaryColor },
          line: { color: secondaryColor },
        });

        pSlide.addShape(pptx.ShapeType.rect, {
          x: densityPadding + colW + 0.3,
          y: colY - 0.1,
          w: colW,
          h: colH + 0.1,
          fill: { color: secondaryColor },
          line: { color: secondaryColor },
        });

        pSlide.addText(slide.columnLeft ?? "", {
          x: densityPadding + 0.15,
          y: colY,
          w: colW - 0.3,
          h: colH,
          fontSize: 13,
          color: textColor,
          fontFace: bodyFont,
          valign: "top",
          wrap: true,
        });

        pSlide.addText(slide.columnRight ?? "", {
          x: densityPadding + colW + 0.45,
          y: colY,
          w: colW - 0.3,
          h: colH,
          fontSize: 13,
          color: textColor,
          fontFace: bodyFont,
          valign: "top",
          wrap: true,
        });
        break;
      }

      case "quote": {
        pSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: SLIDE_W,
          h: 0.08,
          fill: { color: accentColor },
        });
        pSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: SLIDE_H - 0.08,
          w: SLIDE_W,
          h: 0.08,
          fill: { color: accentColor },
        });

        pSlide.addText("\u201C", {
          x: 0.5,
          y: 0.4,
          w: 1,
          h: 1,
          fontSize: 80,
          color: accentColor,
          fontFace: headingFont,
          transparency: 40,
        });

        pSlide.addText(slide.title, {
          x: 1,
          y: SLIDE_H * 0.25,
          w: SLIDE_W - 2,
          h: SLIDE_H * 0.5,
          fontSize: 24,
          bold: true,
          color: textColor,
          fontFace: headingFont,
          align: "center",
          valign: "middle",
          wrap: true,
          italic: true,
        });

        if (slide.body) {
          pSlide.addText(`\u2014 ${slide.body}`, {
            x: densityPadding,
            y: SLIDE_H * 0.78,
            w: SLIDE_W - densityPadding * 2,
            h: 0.4,
            fontSize: 13,
            color: textColor,
            fontFace: bodyFont,
            align: "center",
            transparency: 20,
          });
        }
        break;
      }

      case "metrics": {
        pSlide.addText(slide.title, {
          x: densityPadding,
          y: densityPadding,
          w: SLIDE_W - densityPadding * 2,
          h: 0.7,
          fontSize: 22,
          bold: true,
          color: textColor,
          fontFace: headingFont,
          wrap: true,
        });

        const metrics = slide.metrics ?? [];
        const count = Math.min(metrics.length, 4);
        const metricW = (SLIDE_W - densityPadding * 2 - (count - 1) * 0.3) / Math.max(count, 1);
        const metricY = densityPadding + 1;
        const metricH = SLIDE_H - metricY - densityPadding;

        for (let i = 0; i < count; i++) {
          const mx = densityPadding + i * (metricW + 0.3);

          pSlide.addShape(pptx.ShapeType.rect, {
            x: mx,
            y: metricY,
            w: metricW,
            h: metricH,
            fill: { color: secondaryColor },
            line: { color: secondaryColor },
          });

          pSlide.addText(metrics[i].value, {
            x: mx + 0.1,
            y: metricY + metricH * 0.15,
            w: metricW - 0.2,
            h: metricH * 0.55,
            fontSize: 36,
            bold: true,
            color: accentColor,
            fontFace: headingFont,
            align: "center",
            valign: "middle",
          });

          pSlide.addText(metrics[i].label, {
            x: mx + 0.1,
            y: metricY + metricH * 0.7,
            w: metricW - 0.2,
            h: metricH * 0.25,
            fontSize: 12,
            color: textColor,
            fontFace: bodyFont,
            align: "center",
            transparency: 20,
            wrap: true,
          });
        }
        break;
      }
    }
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return buffer as Buffer;
}
