const { sql } = require('@vercel/postgres');
const crypto = require('crypto');
 
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
  ensured = true;
}
 
function rowToReservation(row) {
  return {
    id: row.id,
    apartment: row.apartment,
    client: row.client,
    phone: row.phone || '',
    email: row.email || '',
    checkin: row.checkin,
    checkout: row.checkout,
    price: row.price === null ? 0 : Number(row.price),
    deposit: row.deposit === null ? 0 : Number(row.deposit),
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
      const client = String(body.client || 'Client sans nom');
      const phone = String(body.phone || '');
      const email = String(body.email || '');
      const checkin = String(body.checkin || '');
      const checkout = String(body.checkout || '');
      const price = Number(body.price) || 0;
      const deposit = Number(body.deposit) || 0;
      const status = String(body.status || 'Confirmée');
      const notes = String(body.notes || '');
      const isExample = !!body.isExample;
 
      await sql`
        INSERT INTO reservations (id, apartment, client, phone, email, checkin, checkout, price, deposit, status, notes, is_example)
        VALUES (${id}, ${apartment}, ${client}, ${phone}, ${email}, ${checkin}, ${checkout}, ${price}, ${deposit}, ${status}, ${notes}, ${isExample});
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
      const client = String(body.client || 'Client sans nom');
      const phone = String(body.phone || '');
      const email = String(body.email || '');
      const checkin = String(body.checkin || '');
      const checkout = String(body.checkout || '');
      const price = Number(body.price) || 0;
      const deposit = Number(body.deposit) || 0;
      const status = String(body.status || 'Confirmée');
      const notes = String(body.notes || '');
 
      await sql`
        UPDATE reservations SET
          apartment=${apartment}, client=${client}, phone=${phone}, email=${email},
          checkin=${checkin}, checkout=${checkout}, price=${price}, deposit=${deposit},
          status=${status}, notes=${notes}
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
 
