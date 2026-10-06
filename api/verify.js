const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Fail closed: credenciais e segredo de assinatura devem existir apenas no ambiente de deploy.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const signingSecret = process.env.BRASILGUARD_SIGNING_SECRET;

export default async function handler(req, res) {
  if (!supabaseUrl || !supabaseKey || !signingSecret) {
    return res.status(503).json({ error: 'service_not_configured' });
  }

  const { caller, destination } = req.body || {};
  if (!caller || !destination) {
    return res.status(400).json({ error: 'caller_and_destination_required' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const token = jwt.sign(
    { attest: 'A', orig: { tn: caller }, iat: Math.floor(Date.now() / 1000) },
    signingSecret,
    { header: { typ: 'passport', ppt: 'shaken', alg: 'HS256' } }
  );

  const { error } = await supabase.from('registros').insert([{
    origem: caller,
    destino: destination,
    token_gerado: token
  }]);

  if (error) {
    console.error('Erro no banco:', error.message);
    return res.status(503).json({ error: 'persistence_failed' });
  }

  return res.status(200).json({ identity_token: token });
}
