-- Permite que a mesma pessoa apareca em campanhas diferentes,
-- mas impede CPF repetido dentro da mesma campanha.

ALTER TABLE apoiadores DROP CONSTRAINT IF EXISTS apoiadores_cpf_key;
ALTER TABLE eleitores DROP CONSTRAINT IF EXISTS eleitores_cpf_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_apoiadores_campanha_cpf
  ON apoiadores (campanha_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eleitores_campanha_cpf
  ON eleitores (campanha_id, cpf)
  WHERE cpf IS NOT NULL;
