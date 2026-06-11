-- 012_config_extras.sql
-- Add dias_alerta column to company_config to allow customizing near-deadline threshold
alter table company_config add column if not exists dias_alerta int default 7;
