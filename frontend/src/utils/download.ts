import { toPng } from 'html-to-image';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function downloadLogSheetPng(
  element: HTMLElement,
  filename = 'log-sheet.png',
): Promise<void> {
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

export async function downloadAllLogSheetsPdf(
  elements: HTMLElement[],
  filename = 'daily-logs.pdf',
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  // Letter landscape: 11 × 8.5 inches at 72 dpi
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'letter' });
  const pageW = 11;
  const pageH = 8.5;
  const margin = 0.5;
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin * 2;

  for (let i = 0; i < elements.length; i++) {
    if (i > 0) pdf.addPage();

    const dataUrl = await toPng(elements[i], {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    });

    const img = await loadImage(dataUrl);
    const aspectRatio = img.naturalWidth / img.naturalHeight;

    let w = contentW;
    let h = w / aspectRatio;

    if (h > contentH) {
      h = contentH;
      w = h * aspectRatio;
    }

    const x = margin + (contentW - w) / 2;
    const y = margin + (contentH - h) / 2;

    pdf.addImage(dataUrl, 'PNG', x, y, w, h);
  }

  pdf.save(filename);
}
