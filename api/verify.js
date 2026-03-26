const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { caller, destination } = req.body;

  try {
    const token = jwt.sign(
      { attest: 'A', orig: { tn: caller }, dest: { tn: [destination] }, iat: Math.floor(Date.now() / 1000) },
      'BGUARD_SECRET_2026',
      { header: { typ: 'passport', ppt: 'shaken', alg: 'HS256' } }
    );

    await supabase.from('registros').insert([{ origem: caller, destino: destination, token_gerado: token }]);

    return res.status(200).json({ identity_token: token });
  } catch (error) {
    return res.status(500).json({ error: 'Erro interno' });
  }
}