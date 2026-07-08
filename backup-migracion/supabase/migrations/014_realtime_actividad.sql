-- 014_realtime_actividad.sql
-- Habilita el canal en tiempo real (Supabase Realtime) para la bitácora de actividad
alter publication supabase_realtime add table actividad_log;
