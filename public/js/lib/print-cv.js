// PDF: shows only the clean CV (no highlight, no app) and opens the browser's print window.
// In that window choose "Save as PDF" and turn off "Headers and footers".
// The browser takes the PDF file name from the page title, so it is set to "Name - CV - Company" for a moment.
import { cvPaper } from './cv-paper.js';

export function printTitle(cv) {
  return [cv.person.name || 'CV', 'CV', cv.job.company].filter(Boolean).join(' - ');
}

// Puts the clean CV in the page and marks the page for printing. Returns a function that puts everything back.
export function startPrint(cv) {
  const root = document.createElement('div');
  root.id = 'print-root';
  root.innerHTML = String(cvPaper(cv, { mark: false }));
  document.body.append(root);
  document.body.classList.add('print-cv');
  const oldTitle = document.title;
  document.title = printTitle(cv);
  return () => {
    document.body.classList.remove('print-cv');
    root.remove();
    document.title = oldTitle;
  };
}

export function printCv(cv) {
  const done = startPrint(cv);
  try {
    window.print(); // waits until the print window closes
  } finally {
    done();
  }
}
