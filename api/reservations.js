const { sql } = require('@vercel/postgres');

let ensured = false;

async function ensureTable() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      apartment TEXT NOT NULL,
      client TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      checkin TEXT NOT NULL,
      checkout TEXT NOT NULL,
      price NUMERIC DEFAULT 0,
      deposit NUMERIC DEFAULT 0,
      status TEXT NOT NULL,
      notes TEXT,
      is_example BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Migration: add the "standard" reservation fields to tables created before
  // this update. All statements are idempotent (IF NOT EXISTS) so this is
  // safe to run on every cold start.
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reservation_number TEXT;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS first_name TEXT;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS last_name TEXT;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS adults INTEGER DEFAULT 1;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS children INTEGER DEFAULT 0;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS booking_channel TEXT DEFAULT 'Direct';`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS tourist_tax NUMERIC DEFAULT 0;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_method TEXT;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Non payé';`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE;`;
  await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS checked_out BOOLEAN DEFAULT FALSE;`;

  ensured = true;
}

async function generateReservationNumber() {
  const year = new Date().getFullYear();
  const prefix = 'RES-' + year + '-';
  const { rows } = await sql`
    SELECT COUNT(*)::int AS count FROM reservations WHERE reservation_number LIKE ${prefix + '%'};
  `;
  const seq = (rows[0] && rows[0].count ? rows[0].count : 0) + 1;
  return prefix + String(seq).padStart(4, '0');
}

function rowToReservation(row) {
  return {
    id: row.id,
    reservationNumber: row.reservation_number || '',
    apartment: row.apartment,
    client: row.client,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    phone: row.phone || '',
    email: row.email || '',
    adults: row.adults === null || row.adults === undefined ? 1 : Number(row.adults),
    children: row.children === null || row.children === undefined ? 0 : Number(row.children),
    checkin: row.checkin,
    checkout: row.checkout,
    price: row.price === null ? 0 : Number(row.price),
    deposit: row.deposit === null ? 0 : Number(row.deposit),
    touristTax: row.tourist_tax === null || row.tourist_tax === undefined ? 0 : Number(row.tourist_tax),
    paymentMethod: row.payment_method || '',
    paymentStatus: row.payment_status || 'Non payé',
    bookingChannel: row.booking_channel || 'Direct',
    checkedIn: !!row.checked_in,
    checkedOut: !!row.checked_out,
    status: row.status,
    notes: row.notes || '',
    isExample: !!row.is_example
  };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!process.env.POSTGRES_URL) {
    res.status(503).json({
      error: 'DB_NOT_CONFIGURED',
      message: "Aucune base de données n'est connectée à ce projet Vercel. Allez dans le tableau de bord Vercel > votre projet > onglet Storage > Create Database (Postgres) pour activer le stockage partagé."
    });
    return;
  }

  try {
    await ensureTable();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM reservations ORDER BY checkin ASC;`;
      res.status(200).json(rows.map(rowToReservation));
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const apartment = String(body.apartment || '');
      const firstName = String(body.firstName || '').trim();
      const lastName = String(body.lastName || '').trim();
      const client = (firstName || lastName) ? (firstName + ' ' + lastName).trim() : String(body.client || 'Client sans nom');
      const phone = String(body.phone || '');
      const email = String(body.email || '');
      const adults = Math.max(1, parseInt(body.adults, 10) || 1);
      const children = Math.max(0, parseInt(body.children, 10) || 0);
      const checkin = String(body.checkin || '');
      const checkout = String(body.checkout || '');
      const price = Number(body.price) || 0;
      const deposit = Number(body.deposit) || 0;
      const touristTax = Number(body.touristTax) || 0;
      const paymentMethod = String(body.paymentMethod || '');
      const paymentStatus = String(body.paymentStatus || 'Non payé');
      const bookingChannel = String(body.bookingChannel || 'Direct');
      const status = String(body.status || 'Confirmée');
      const notes = String(body.notes || '');
      const isExample = !!body.isExample;
      const reservationNumber = await generateReservationNumber();

      await sql`
        INSERT INTO reservations (
          id, reservation_number, apartment, client, first_name, last_name, phone, email,
          adults, children, checkin, checkout, price, deposit, tourist_tax,
          payment_method, payment_status, booking_channel, status, notes, is_example
        )
        VALUES (
          ${id}, ${reservationNumber}, ${apartment}, ${client}, ${firstName}, ${lastName}, ${phone}, ${email},
          ${adults}, ${children}, ${checkin}, ${checkout}, ${price}, ${deposit}, ${touristTax},
          ${paymentMethod}, ${paymentStatus}, ${bookingChannel}, ${status}, ${notes}, ${isExample}
        );
      `;
      const { rows } = await sql`SELECT * FROM reservations WHERE id = ${id};`;
      res.status(201).json(rowToReservation(rows[0]));
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const id = String(body.id || '');
      if (!id) {
        res.status(400).json({ error: 'MISSING_ID' });
        return;
      }
      const apartment = String(body.apartment || '');
      const firstName = String(body.firstName || '').trim();
      const lastName = String(body.lastName || '').trim();
      const client = (firstName || lastName) ? (firstName + ' ' + lastName).trim() : String(body.client || 'Client sans nom');
      const phone = String(body.phone || '');
      const email = String(body.email || '');
      const adults = Math.max(1, parseInt(body.adults, 10) || 1);
      const children = Math.max(0, parseInt(body.children, 10) || 0);
      const checkin = String(body.checkin || '');
      const checkout = String(body.checkout || '');
      const price = Number(body.price) || 0;
      const deposit = Number(body.deposit) || 0;
      const touristTax = Number(body.touristTax) || 0;
      const paymentMethod = String(body.paymentMethod || '');
      const paymentStatus = String(body.paymentStatus || 'Non payé');
      const bookingChannel = String(body.bookingChannel || 'Direct');
      const status = String(body.status || 'Confirmée');
      const notes = String(body.notes || '');
      const checkedIn = !!body.checkedIn;
      const checkedOut = !!body.checkedOut;

      await sql`
        UPDATE reservations SET
          apartment=${apartment}, client=${client}, first_name=${firstName}, last_name=${lastName},
          phone=${phone}, email=${email}, adults=${adults}, children=${children},
          checkin=${checkin}, checkout=${checkout}, price=${price}, deposit=${deposit},
          tourist_tax=${touristTax}, payment_method=${paymentMethod}, payment_status=${paymentStatus},
          booking_channel=${bookingChannel}, status=${status}, notes=${notes},
          checked_in=${checkedIn}, checked_out=${checkedOut}
        WHERE id=${id};
      `;
      const { rows } = await sql`SELECT * FROM reservations WHERE id = ${id};`;
      if (rows.length === 0) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.status(200).json(rowToReservation(rows[0]));
      return;
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!id) {
        res.status(400).json({ error: 'MISSING_ID' });
        return;
      }
      await sql`DELETE FROM reservations WHERE id = ${id};`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR', message: String(err && err.message ? err.message : err) });
  }
};
