const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'method_not_allowed'});

  const supabaseUrl = process.env.SUPABASE_URL || 'MUDARASENHA';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'MUDARASENHA';
  if(supabaseUrl==='MUDARASENHA' || supabaseKey==='MUDARASENHA'){
    return res.status(503).json({ok:false,error:'configuration_pending',marker:'MUDARASENHA'});
  }

  const a=req.body||{};
  if(!a.id || !a.clientName || !a.clientPhone || !a.serviceName || !a.startsAt){
    return res.status(400).json({ok:false,error:'invalid_appointment'});
  }

  const db=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false}});
  const {error}=await db.from('bgd_appointments').insert({
    id:a.id,
    client_name:a.clientName,
    client_phone:a.clientPhone,
    client_email:a.clientEmail||null,
    service_name:a.serviceName,
    starts_at:a.startsAt,
    duration_minutes:a.durationMinutes||60,
    allow_reschedule:!!a.allowReschedule,
    reschedule_limit_hours:a.rescheduleLimitHours||0,
    reminders:a.reminders||{},
    status:a.status||'scheduled'
  });
  if(error) return res.status(500).json({ok:false,error:error.message});
  return res.status(201).json({ok:true,id:a.id});
};
