// Small text helpers shared by the CV paper (browser) and the Word CV (server). Pure functions, no page needed.

// A link without http(s):// and without a closing slash, for a CV line.
export const bare = (url) => String(url ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');

// "Colombo, Sri Lanka". If the location already names the country, it is not added twice.
export function placeLine(person) {
  const place = String(person.location ?? '').trim();
  const country = String(person.country ?? '').trim();
  if (!country) return place;
  if (!place) return country;
  return place.toLowerCase().includes(country.toLowerCase()) ? place : `${place}, ${country}`;
}

// The contact line under the name: email, phone, place, then the links.
export function contactParts(person) {
  return [
    person.email, person.phone, placeLine(person),
    bare(person.portfolio), bare(person.linkedin), bare(person.github), bare(person.other_link),
  ].filter(Boolean);
}

// "Sinhalese (Native or Bilingual), English (Professional Working)"
export const languageLine = (list = []) => list.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(', ');
