import pool from "../db.js";

export async function getActiveRuleByCode(code, client = null) {
  const executor = client || pool;
  const { rows } = await executor.query(
    `SELECT r.id AS rule_id, rv.id AS rule_version_id, rv.type, rv.params
     FROM rules r
     JOIN rule_versions rv ON rv.rule_id = r.id
     WHERE r.code = $1 AND rv.status = 'active'
     ORDER BY rv.version DESC
     LIMIT 1`,
    [code]
  );
  if (!rows.length) {
    return null;
  }
  return rows[0];
}
