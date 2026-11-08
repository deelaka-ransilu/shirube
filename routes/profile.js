// Profile API routes: skills, experiences, and education.
import { db } from '../db.js';

// Checks date strings: YYYY-MM or YYYY-MM-DD.
function isValidDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1900 || year > 2100) return false;

  if (match[3]) {
    const day = Number(match[3]);
    const maxDays = new Date(year, month, 0).getDate();
    if (day > maxDays) return false;
  }
  return true;
}

// Checks URL strings: must start with http:// or https://.
function isValidUrl(urlStr) {
  if (typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Sends a JSON response with status and headers.
function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

// Reads and parses JSON from the request stream.
export async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// Handles skills CRUD.
async function handleSkills(req, res, id, method) {
  if (!id) {
    if (method === 'GET') {
      const skills = db.prepare(`
        SELECT s.id, s.name, s.level, s.proof_url, s.used_at_experience,
               e.title AS experience_title, e.organisation AS experience_organisation
        FROM skills s
        LEFT JOIN experiences e ON s.used_at_experience = e.id
        ORDER BY s.level DESC, s.name COLLATE NOCASE ASC;
      `).all();
      return sendJson(res, 200, skills);
    }

    if (method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return sendJson(res, 400, { error: 'Name is required.' });
      }

      const existing = db.prepare('SELECT id FROM skills WHERE LOWER(name) = LOWER(?);').get(name);
      if (existing) {
        return sendJson(res, 400, { error: 'A skill with this name already exists.' });
      }

      const level = Number(body.level);
      if (!Number.isInteger(level) || level < 1 || level > 5) {
        return sendJson(res, 400, { error: 'Level must be a number between 1 and 5.' });
      }

      let proofUrl = typeof body.proof_url === 'string' ? body.proof_url.trim() : null;
      if (proofUrl === '') proofUrl = null;
      if (proofUrl !== null && !isValidUrl(proofUrl)) {
        return sendJson(res, 400, { error: 'Proof link must start with http:// or https://.' });
      }

      let usedAt = body.used_at_experience ? Number(body.used_at_experience) : null;
      if (usedAt) {
        const exp = db.prepare('SELECT id FROM experiences WHERE id = ?;').get(usedAt);
        if (!exp) {
          return sendJson(res, 400, { error: 'Selected experience does not exist.' });
        }
      }

      const info = db.prepare(`
        INSERT INTO skills (name, level, proof_url, used_at_experience)
        VALUES (?, ?, ?, ?);
      `).run(name, level, proofUrl, usedAt);

      const created = db.prepare(`
        SELECT s.id, s.name, s.level, s.proof_url, s.used_at_experience,
               e.title AS experience_title, e.organisation AS experience_organisation
        FROM skills s
        LEFT JOIN experiences e ON s.used_at_experience = e.id
        WHERE s.id = ?;
      `).get(info.lastInsertRowid);

      return sendJson(res, 201, created);
    }

    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  // Item routes with an ID.
  const skill = db.prepare(`
    SELECT s.id, s.name, s.level, s.proof_url, s.used_at_experience,
           e.title AS experience_title, e.organisation AS experience_organisation
    FROM skills s
    LEFT JOIN experiences e ON s.used_at_experience = e.id
    WHERE s.id = ?;
  `).get(id);

  if (!skill) {
    return sendJson(res, 404, { error: 'Skill not found.' });
  }

  if (method === 'GET') {
    return sendJson(res, 200, skill);
  }

  if (method === 'PUT') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return sendJson(res, 400, { error: 'Name is required.' });
    }

    const existing = db.prepare('SELECT id FROM skills WHERE LOWER(name) = LOWER(?) AND id != ?;').get(name, id);
    if (existing) {
      return sendJson(res, 400, { error: 'A skill with this name already exists.' });
    }

    const level = Number(body.level);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      return sendJson(res, 400, { error: 'Level must be a number between 1 and 5.' });
    }

    let proofUrl = typeof body.proof_url === 'string' ? body.proof_url.trim() : null;
    if (proofUrl === '') proofUrl = null;
    if (proofUrl !== null && !isValidUrl(proofUrl)) {
      return sendJson(res, 400, { error: 'Proof link must start with http:// or https://.' });
    }

    let usedAt = body.used_at_experience ? Number(body.used_at_experience) : null;
    if (usedAt) {
      const exp = db.prepare('SELECT id FROM experiences WHERE id = ?;').get(usedAt);
      if (!exp) {
        return sendJson(res, 400, { error: 'Selected experience does not exist.' });
      }
    }

    db.prepare(`
      UPDATE skills
      SET name = ?, level = ?, proof_url = ?, used_at_experience = ?
      WHERE id = ?;
    `).run(name, level, proofUrl, usedAt, id);

    const updated = db.prepare(`
      SELECT s.id, s.name, s.level, s.proof_url, s.used_at_experience,
             e.title AS experience_title, e.organisation AS experience_organisation
      FROM skills s
      LEFT JOIN experiences e ON s.used_at_experience = e.id
      WHERE s.id = ?;
    `).get(id);

    return sendJson(res, 200, updated);
  }

  if (method === 'DELETE') {
    db.prepare('DELETE FROM skills WHERE id = ?;').run(id);
    return sendJson(res, 200, { ok: true, id });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT, DELETE' });
}

// Handles experiences CRUD.
async function handleExperiences(req, res, id, method) {
  if (!id) {
    if (method === 'GET') {
      const list = db.prepare(`
        SELECT id, kind, title, organisation, start_date, end_date, is_current, description
        FROM experiences
        ORDER BY is_current DESC, start_date DESC, id DESC;
      `).all();
      return sendJson(res, 200, list);
    }

    if (method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }

      const kind = body.kind;
      if (kind !== 'experience' && kind !== 'volunteering') {
        return sendJson(res, 400, { error: 'Type must be Experience or Volunteering.' });
      }

      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return sendJson(res, 400, { error: 'Title is required.' });
      }

      let organisation = typeof body.organisation === 'string' ? body.organisation.trim() : null;
      if (organisation === '') organisation = null;

      const startDate = typeof body.start_date === 'string' ? body.start_date.trim() : '';
      if (!startDate) {
        return sendJson(res, 400, { error: 'Start date is required.' });
      }
      if (!isValidDate(startDate)) {
        return sendJson(res, 400, { error: 'Start date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
      }

      const isCurrent = body.is_current ? 1 : 0;
      let endDate = typeof body.end_date === 'string' ? body.end_date.trim() : null;
      if (isCurrent === 1 || endDate === '') {
        endDate = null;
      } else if (endDate !== null) {
        if (!isValidDate(endDate)) {
          return sendJson(res, 400, { error: 'End date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
        }
        if (endDate < startDate) {
          return sendJson(res, 400, { error: 'End date cannot be earlier than start date.' });
        }
      }

      let description = typeof body.description === 'string' ? body.description.trim() : null;
      if (description === '') description = null;

      const info = db.prepare(`
        INSERT INTO experiences (kind, title, organisation, start_date, end_date, is_current, description)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `).run(kind, title, organisation, startDate, endDate, isCurrent, description);

      const created = db.prepare('SELECT * FROM experiences WHERE id = ?;').get(info.lastInsertRowid);
      return sendJson(res, 201, created);
    }

    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  // Item routes with an ID.
  const item = db.prepare('SELECT * FROM experiences WHERE id = ?;').get(id);
  if (!item) {
    return sendJson(res, 404, { error: 'Experience entry not found.' });
  }

  if (method === 'GET') {
    return sendJson(res, 200, item);
  }

  if (method === 'PUT') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const kind = body.kind;
    if (kind !== 'experience' && kind !== 'volunteering') {
      return sendJson(res, 400, { error: 'Type must be Experience or Volunteering.' });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return sendJson(res, 400, { error: 'Title is required.' });
    }

    let organisation = typeof body.organisation === 'string' ? body.organisation.trim() : null;
    if (organisation === '') organisation = null;

    const startDate = typeof body.start_date === 'string' ? body.start_date.trim() : '';
    if (!startDate) {
      return sendJson(res, 400, { error: 'Start date is required.' });
    }
    if (!isValidDate(startDate)) {
      return sendJson(res, 400, { error: 'Start date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
    }

    const isCurrent = body.is_current ? 1 : 0;
    let endDate = typeof body.end_date === 'string' ? body.end_date.trim() : null;
    if (isCurrent === 1 || endDate === '') {
      endDate = null;
    } else if (endDate !== null) {
      if (!isValidDate(endDate)) {
        return sendJson(res, 400, { error: 'End date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
      }
      if (endDate < startDate) {
        return sendJson(res, 400, { error: 'End date cannot be earlier than start date.' });
      }
    }

    let description = typeof body.description === 'string' ? body.description.trim() : null;
    if (description === '') description = null;

    db.prepare(`
      UPDATE experiences
      SET kind = ?, title = ?, organisation = ?, start_date = ?, end_date = ?, is_current = ?, description = ?
      WHERE id = ?;
    `).run(kind, title, organisation, startDate, endDate, isCurrent, description, id);

    const updated = db.prepare('SELECT * FROM experiences WHERE id = ?;').get(id);
    return sendJson(res, 200, updated);
  }

  if (method === 'DELETE') {
    db.prepare('DELETE FROM experiences WHERE id = ?;').run(id);
    return sendJson(res, 200, { ok: true, id });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT, DELETE' });
}

// Handles education CRUD.
async function handleEducation(req, res, id, method) {
  if (!id) {
    if (method === 'GET') {
      const list = db.prepare(`
        SELECT id, course, institution, start_date, end_date
        FROM education
        ORDER BY start_date DESC, id DESC;
      `).all();
      return sendJson(res, 200, list);
    }

    if (method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }

      const course = typeof body.course === 'string' ? body.course.trim() : '';
      if (!course) {
        return sendJson(res, 400, { error: 'Course is required.' });
      }

      let institution = typeof body.institution === 'string' ? body.institution.trim() : null;
      if (institution === '') institution = null;

      let startDate = typeof body.start_date === 'string' ? body.start_date.trim() : null;
      if (startDate === '') startDate = null;
      if (startDate !== null && !isValidDate(startDate)) {
        return sendJson(res, 400, { error: 'Start date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
      }

      let endDate = typeof body.end_date === 'string' ? body.end_date.trim() : null;
      if (endDate === '') endDate = null;
      if (endDate !== null && !isValidDate(endDate)) {
        return sendJson(res, 400, { error: 'End date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
      }
      if (startDate && endDate && endDate < startDate) {
        return sendJson(res, 400, { error: 'End date cannot be earlier than start date.' });
      }

      const info = db.prepare(`
        INSERT INTO education (course, institution, start_date, end_date)
        VALUES (?, ?, ?, ?);
      `).run(course, institution, startDate, endDate);

      const created = db.prepare('SELECT * FROM education WHERE id = ?;').get(info.lastInsertRowid);
      return sendJson(res, 201, created);
    }

    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  }

  // Item routes with an ID.
  const item = db.prepare('SELECT * FROM education WHERE id = ?;').get(id);
  if (!item) {
    return sendJson(res, 404, { error: 'Education entry not found.' });
  }

  if (method === 'GET') {
    return sendJson(res, 200, item);
  }

  if (method === 'PUT') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const course = typeof body.course === 'string' ? body.course.trim() : '';
    if (!course) {
      return sendJson(res, 400, { error: 'Course is required.' });
    }

    let institution = typeof body.institution === 'string' ? body.institution.trim() : null;
    if (institution === '') institution = null;

    let startDate = typeof body.start_date === 'string' ? body.start_date.trim() : null;
    if (startDate === '') startDate = null;
    if (startDate !== null && !isValidDate(startDate)) {
      return sendJson(res, 400, { error: 'Start date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
    }

    let endDate = typeof body.end_date === 'string' ? body.end_date.trim() : null;
    if (endDate === '') endDate = null;
    if (endDate !== null && !isValidDate(endDate)) {
      return sendJson(res, 400, { error: 'End date must be in YYYY-MM or YYYY-MM-DD format (for example, 2024-05).' });
    }
    if (startDate && endDate && endDate < startDate) {
      return sendJson(res, 400, { error: 'End date cannot be earlier than start date.' });
    }

    db.prepare(`
      UPDATE education
      SET course = ?, institution = ?, start_date = ?, end_date = ?
      WHERE id = ?;
    `).run(course, institution, startDate, endDate, id);

    const updated = db.prepare('SELECT * FROM education WHERE id = ?;').get(id);
    return sendJson(res, 200, updated);
  }

  if (method === 'DELETE') {
    db.prepare('DELETE FROM education WHERE id = ?;').run(id);
    return sendJson(res, 200, { ok: true, id });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, PUT, DELETE' });
}

// Dispatches /api/ profile requests. Returns true if handled.
export async function handleProfileRequest(req, res, url) {
  const method = req.method.toUpperCase();
  const path = url.pathname.replace(/\/+$/, ''); // trim trailing slash

  // Overview endpoint: /api/profile
  if (path === '/api/profile') {
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
      return true;
    }

    const skills = db.prepare(`
      SELECT s.id, s.name, s.level, s.proof_url, s.used_at_experience,
             e.title AS experience_title, e.organisation AS experience_organisation
      FROM skills s
      LEFT JOIN experiences e ON s.used_at_experience = e.id
      ORDER BY s.level DESC, s.name COLLATE NOCASE ASC;
    `).all();

    const experiences = db.prepare(`
      SELECT id, kind, title, organisation, start_date, end_date, is_current, description
      FROM experiences
      ORDER BY is_current DESC, start_date DESC, id DESC;
    `).all();

    const education = db.prepare(`
      SELECT id, course, institution, start_date, end_date
      FROM education
      ORDER BY start_date DESC, id DESC;
    `).all();

    sendJson(res, 200, { skills, experiences, education });
    return true;
  }

  // Skills: /api/skills or /api/profile/skills
  const skillsMatch = path.match(/^(?:\/api\/profile\/skills|\/api\/skills)(?:\/(\d+))?$/);
  if (skillsMatch) {
    const id = skillsMatch[1] ? Number(skillsMatch[1]) : null;
    await handleSkills(req, res, id, method);
    return true;
  }

  // Experiences: /api/experiences or /api/profile/experiences
  const expMatch = path.match(/^(?:\/api\/profile\/experiences|\/api\/experiences)(?:\/(\d+))?$/);
  if (expMatch) {
    const id = expMatch[1] ? Number(expMatch[1]) : null;
    await handleExperiences(req, res, id, method);
    return true;
  }

  // Education: /api/education or /api/profile/education
  const eduMatch = path.match(/^(?:\/api\/profile\/education|\/api\/education)(?:\/(\d+))?$/);
  if (eduMatch) {
    const id = eduMatch[1] ? Number(eduMatch[1]) : null;
    await handleEducation(req, res, id, method);
    return true;
  }

  return false;
}
