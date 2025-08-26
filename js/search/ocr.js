// On-demand OCR with Tesseract.js for a page image/blob
// Requires <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
// Gate behind a feature flag due to worker requirements.

export async function ensureLib() {
  if (window.Tesseract) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
export async function ocrBlobToText(blob) {
  await ensureLib();
  const worker = await Tesseract.createWorker();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  const { data: { text } } = await worker.recognize(blob);
  await worker.terminate();
  return text;
}
