// The CV as a Word file for one job: GET /api/jobs/:id/cv.docx?preset=<id>
// Same facts as the match answer; the skills the advert asks for come first. No highlight, no rewriting.
import { getMatch } from './match.js';
import { makeDocx, cvFileName } from '../lib/docx.js';

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function getCvDocx(ctx) {
  const d = getMatch(ctx);
  return { file: { buffer: makeDocx(d), name: cvFileName(d, 'docx'), type: DOCX_TYPE } };
}
