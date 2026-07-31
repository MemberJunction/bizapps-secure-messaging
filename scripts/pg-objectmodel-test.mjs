// Comprehensive functional test of the BizApps Secure Messaging object model on PostgreSQL.
//
// Exercises the WRITE path (CodeGen-generated CRUD functions), the READ path (base views), and
// the conversion hazards that a T-SQL -> PostgreSQL port actually hits: BIT -> BOOLEAN (no
// implicit int cast on PG, so a surviving `= 1` comparison or a `DEFAULT 0` is a hard error),
// the `_Clear` companion-parameter convention that distinguishes "omitted, keep current value"
// from "explicitly set to NULL", DB-level CHECK enforcement on all six status/direction value
// sets, intra-schema FK enforcement, the six row-touch triggers, and bigint round-tripping past
// the 32-bit boundary. Also asserts the object-model SHAPE, which is what regressed when the
// baseline's metadata literals named the canonical-cased schema instead of the physical one
// (CodeGen then treated the lowercase physical schema as a second, unknown schema and duplicated
// every function, view, trigger and entity).
//
// Self-cleaning. Secure Messaging analog of bizapps-common's, bizapps-tasks' and bizapps-issues'
// scripts/pg-objectmodel-test.mjs — run it against a one-shot install (see
// migrations-pg/docs/PG_INSTALL_VERIFICATION.md), no codegen required.
//
// Run: node scripts/pg-objectmodel-test.mjs
// Connection via env: PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
import { Pool } from 'pg';

// The PHYSICAL schema — lowercase. PostgreSQL folds unquoted identifiers, and every metadata
// literal in the PG baseline names this form (see scripts/pg-finalize.mjs patch 9).
const S = '__mj_bizappssecuremessaging';

const pool = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: +(process.env.PGPORT ?? 5434),
  user: process.env.PGUSER ?? 'mj_admin',
  password: process.env.PGPASSWORD ?? 'SmPg_2026!',
  database: process.env.PGDATABASE ?? 'SM_Shot3',
});
const q = (sql, p) => pool.query(sql, p);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { fail++; console.log(`  ✗ ${n} — ${d}`); };
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));

// Rows to remove, newest first — cleanup walks this in insertion-reverse order, which is also
// reverse-dependency order given the create sequence below.
const created = [];

async function createRow(table, args) {
  const keys = Object.keys(args);
  const sql = `SELECT * FROM ${S}."spCreate${table}"(${keys.map((k, i) => `${k} := $${i + 1}`).join(', ')})`;
  const row = (await q(sql, Object.values(args))).rows[0];
  created.unshift({ table, id: row.ID });
  return row;
}

const update = async (table, args) => {
  const keys = Object.keys(args);
  const sql = `SELECT * FROM ${S}."spUpdate${table}"(${keys.map((k, i) => `${k} := $${i + 1}`).join(', ')})`;
  return (await q(sql, Object.values(args))).rows[0];
};

async function expectError(name, sql, params, needle) {
  try {
    await q(sql, params);
    bad(name, 'statement succeeded but should have violated a constraint');
  } catch (e) {
    check(name, e.message.includes(needle), e.message.slice(0, 140));
  }
}

const future = new Date(Date.now() + 7 * 864e5).toISOString();

async function main() {
  console.log('\n[1] Object-model shape (the duplication regression reads here)');
  const shape = (await q(
    `SELECT (SELECT count(*) FROM pg_class WHERE relnamespace=$1::regnamespace AND relkind='r') tables,
            (SELECT count(*) FROM pg_class WHERE relnamespace=$1::regnamespace AND relkind='v') views,
            (SELECT count(*) FROM pg_proc  WHERE pronamespace=$1::regnamespace) fns,
            (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
              WHERE c.relnamespace=$1::regnamespace AND NOT t.tgisinternal) trgs`, [S])).rows[0];
  check('6 tables / 6 views / 24 functions / 6 triggers',
    +shape.tables === 6 && +shape.views === 6 && +shape.fns === 24 && +shape.trgs === 6,
    JSON.stringify(shape));
  const dupes = (await q(
    `SELECT proname, count(*) c FROM pg_proc WHERE pronamespace=$1::regnamespace
     GROUP BY 1 HAVING count(*) > 1`, [S])).rows;
  check('no duplicate function overloads', dupes.length === 0, JSON.stringify(dupes));
  const suffixed = (await q(
    `SELECT "Name" FROM __mj."Entity" WHERE "Name" LIKE '%\\_\\_\\_\\_mj\\_%'`)).rows;
  check('no schema-suffixed duplicate Entity rows', suffixed.length === 0, JSON.stringify(suffixed));
  const cls = (await q(
    `SELECT "ClassName" FROM __mj."vwEntities" WHERE lower("SchemaName")=$1 ORDER BY 1`, [S])).rows;
  check('6 entities with PascalCase generated ClassNames',
    cls.length === 6 && cls.every((r) => r.ClassName?.startsWith('mjBizAppsSecureMessaging')),
    JSON.stringify(cls.map((r) => r.ClassName)));

  console.log('\n[2] Dependency-ordered create through all six spCreate* + view visibility');
  const session = await createRow('PortalSession', {
    p_contactid: '22222222-2222-2222-2222-222222222222',
    p_tokenhash: 'TEST-session-hash', p_status: 'Active', p_expiresat: future,
  });
  const thread = await createRow('SecureThread', {
    p_contactid: '22222222-2222-2222-2222-222222222222',
    p_subject: 'TEST thread', p_status: 'Active',
  });
  const message = await createRow('SecureMessage', {
    p_portalsessionid: session.ID, p_threadid: thread.ID, p_direction: 'Inbound',
    p_sender: 'test@example.com', p_recipient: 'staff@example.com', p_content: 'TEST body',
    p_status: 'New',
  });
  const file = await createRow('MessageFile', {
    p_securemessageid: message.ID, p_threadid: thread.ID, p_filename: 'TEST.pdf',
    p_contenttype: 'application/pdf', p_size: '5368709120', // 5 GiB — past the 32-bit boundary
  });
  const request = await createRow('FileRequest', {
    p_portalsessionid: session.ID, p_threadid: thread.ID, p_title: 'TEST request',
    p_status: 'Pending',
  });
  const link = await createRow('PortalMagicLink', {
    p_portalsessionid: session.ID, p_tokenhash: 'TEST-link-hash', p_status: 'Pending',
    p_expiresat: future, p_deeplinkthreadid: thread.ID,
  });
  for (const [view, id] of [['vwPortalSessions', session.ID], ['vwSecureThreads', thread.ID],
    ['vwSecureMessages', message.ID], ['vwMessageFiles', file.ID],
    ['vwFileRequests', request.ID], ['vwPortalMagicLinks', link.ID]]) {
    const n = +(await q(`SELECT count(*) c FROM ${S}."${view}" WHERE "ID"=$1`, [id])).rows[0].c;
    check(`${view} returns the created row`, n === 1, `got ${n}`);
  }

  console.log('\n[3] BIT -> BOOLEAN conversion (PG has no implicit int cast)');
  check('SecureMessage boolean defaults are real booleans (true/false, not 1/0)',
    message.IsSecure === true && message.IsStarred === false && message.IsImported === false,
    JSON.stringify({ s: message.IsSecure, st: message.IsStarred, i: message.IsImported }));
  check('SecureThread.IsDeleted default is boolean false', thread.IsDeleted === false, `got ${thread.IsDeleted}`);
  const flipped = await update('SecureMessage', { p_id: message.ID, p_isstarred: true, p_issecure: false });
  check('booleans round-trip through spUpdate',
    flipped.IsStarred === true && flipped.IsSecure === false,
    JSON.stringify({ st: flipped.IsStarred, s: flipped.IsSecure }));
  const filtered = +(await q(
    `SELECT count(*) c FROM ${S}."vwSecureThreads" WHERE "IsDeleted" = FALSE AND "ID"=$1`, [thread.ID])).rows[0].c;
  check('boolean predicate in a view filter (no `= 0` residue)', filtered === 1, `got ${filtered}`);

  console.log("\n[4] _Clear companion: omitted keeps current, _clear := TRUE nulls it");
  check('nullable field starts NULL', thread.SourceChannel === null, `got ${thread.SourceChannel}`);
  let t = await update('SecureThread', { p_id: thread.ID, p_sourcechannel: 'Email' });
  check('set nullable value', t.SourceChannel === 'Email', `got ${t.SourceChannel}`);
  t = await update('SecureThread', { p_id: thread.ID, p_subject: 'TEST thread v2' });
  check('omitting the param PRESERVES the value (not clobbered to NULL)',
    t.SourceChannel === 'Email' && t.Subject === 'TEST thread v2',
    JSON.stringify({ sc: t.SourceChannel, s: t.Subject }));
  t = await update('SecureThread', { p_id: thread.ID, p_sourcechannel_clear: true });
  check('explicit _clear := TRUE sets NULL', t.SourceChannel === null, `got ${t.SourceChannel}`);
  const f = await update('FileRequest', { p_id: request.ID, p_instructions: 'TEST instructions' });
  check('_Clear convention holds on a second table (FileRequest.Instructions)',
    f.Instructions === 'TEST instructions', `got ${f.Instructions}`);
  const m = await update('MessageFile', { p_id: file.ID, p_contenttype_clear: true });
  check('_Clear convention holds on a third table (MessageFile.ContentType)',
    m.ContentType === null, `got ${m.ContentType}`);

  console.log('\n[5] bigint round-trip past the 32-bit boundary');
  check('MessageFile.Size stores 5368709120 (bigint, not int)',
    String(file.Size) === '5368709120', `got ${file.Size}`);

  console.log('\n[6] All six CHECK constraints enforced at the DB level');
  for (const [name, sql, params, needle] of [
    ['SecureThread.Status', `SELECT "ID" FROM ${S}."spCreateSecureThread"(p_contactid := $1, p_subject := 'bad', p_status := 'Open')`,
      ['22222222-2222-2222-2222-222222222222'], 'CK_SecureThread_Status'],
    ['SecureMessage.Status', `SELECT "ID" FROM ${S}."spUpdateSecureMessage"(p_id := $1, p_status := 'Bogus')`,
      [message.ID], 'CK_SecureMessage_Status'],
    ['SecureMessage.Direction', `SELECT "ID" FROM ${S}."spUpdateSecureMessage"(p_id := $1, p_direction := 'Sideways')`,
      [message.ID], 'CK_SecureMessage_Direction'],
    ['FileRequest.Status', `SELECT "ID" FROM ${S}."spUpdateFileRequest"(p_id := $1, p_status := 'Bogus')`,
      [request.ID], 'CK_FileRequest_Status'],
    ['PortalMagicLink.Status', `SELECT "ID" FROM ${S}."spUpdatePortalMagicLink"(p_id := $1, p_status := 'Bogus')`,
      [link.ID], 'CK_PortalMagicLink_Status'],
    ['PortalSession.Status', `SELECT "ID" FROM ${S}."spUpdatePortalSession"(p_id := $1, p_status := 'Bogus')`,
      [session.ID], 'CK_PortalSession_Status'],
  ]) await expectError(`CHECK rejects invalid ${name}`, sql, params, needle);

  console.log('\n[7] FK enforcement');
  await expectError('FK rejects SecureMessage with unknown ThreadID',
    `SELECT "ID" FROM ${S}."spCreateSecureMessage"(p_portalsessionid := $1, p_threadid := $2,
       p_direction := 'Inbound', p_sender := 'x@y.z', p_recipient := 'a@b.c', p_content := 'bad', p_status := 'New')`,
    [session.ID, '99999999-9999-9999-9999-999999999999'], 'FK_SecureMessage_SecureThread');

  console.log('\n[8] Row-touch triggers bump __mj_UpdatedAt on all six tables');
  const skew = +(await q(
    `SELECT abs(extract(epoch FROM (now() - "__mj_CreatedAt"))) s FROM ${S}."SecureThread" WHERE "ID"=$1`,
    [thread.ID])).rows[0].s;
  check('__mj_CreatedAt default is close to now() (UTC-normalized default)', skew < 300, `${skew}s skew`);
  for (const [table, id, args] of [
    ['PortalSession', session.ID, { p_tokenhash: 'TEST-session-hash-2' }],
    ['SecureThread', thread.ID, { p_subject: 'TEST thread v3' }],
    ['SecureMessage', message.ID, { p_content: 'TEST body v2' }],
    ['MessageFile', file.ID, { p_filename: 'TEST2.pdf' }],
    ['FileRequest', request.ID, { p_title: 'TEST request v2' }],
    ['PortalMagicLink', link.ID, { p_tokenhash: 'TEST-link-hash-2' }],
  ]) {
    const before = (await q(`SELECT "__mj_UpdatedAt" u FROM ${S}."${table}" WHERE "ID"=$1`, [id])).rows[0].u;
    await new Promise((r) => setTimeout(r, 15));
    await update(table, { p_id: id, ...args });
    const after = (await q(`SELECT "__mj_UpdatedAt" u FROM ${S}."${table}" WHERE "ID"=$1`, [id])).rows[0].u;
    check(`fn_trg_update_${table.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()} bumped __mj_UpdatedAt`,
      new Date(after) > new Date(before), `${before} -> ${after}`);
  }

  console.log('\n[9] Delete round-trip + NULL-ID not-found sentinel');
  // CodeGen's PostgreSQL spDelete* contract differs from T-SQL's: instead of returning zero rows
  // when nothing matched, it returns exactly ONE row whose ID is NULL
  // (`IF v_affected_count = 0 THEN RETURN QUERY SELECT NULL::UUID AS "ID"`). Every app in the
  // fleet emits this, so the caller distinguishes deleted-vs-not-found on the ID being NULL, not
  // on rowCount. Asserted here so a future codegen change to the sentinel reads as a failure.
  const missing = await q(
    `SELECT * FROM ${S}."spDeleteSecureThread"($1)`, ['99999999-9999-9999-9999-999999999999']);
  check('spDelete* on a missing PK returns one row with ID = NULL (not-found sentinel)',
    missing.rowCount === 1 && missing.rows[0].ID === null,
    `${missing.rowCount} row(s), ID=${JSON.stringify(missing.rows[0]?.ID)}`);
  let cleaned = 0;
  for (const r of created) {
    const res = await q(`SELECT * FROM ${S}."spDelete${r.table}"($1)`, [r.id]);
    if (res.rowCount === 1 && res.rows[0].ID === r.id) cleaned++;
  }
  check(`spDelete* removed all ${created.length} created rows and returned each PK`,
    cleaned === created.length, `cleaned ${cleaned}`);
  const leftovers = +(await q(
    `SELECT (SELECT count(*) FROM ${S}."SecureThread" WHERE "Subject" LIKE 'TEST%')
          + (SELECT count(*) FROM ${S}."SecureMessage" WHERE "Content" LIKE 'TEST%')
          + (SELECT count(*) FROM ${S}."MessageFile" WHERE "Filename" LIKE 'TEST%')
          + (SELECT count(*) FROM ${S}."FileRequest" WHERE "Title" LIKE 'TEST%')
          + (SELECT count(*) FROM ${S}."PortalMagicLink" WHERE "TokenHash" LIKE 'TEST%')
          + (SELECT count(*) FROM ${S}."PortalSession" WHERE "TokenHash" LIKE 'TEST%') c`)).rows[0].c;
  check('no TEST leftovers', leftovers === 0, `found ${leftovers}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('FATAL:', e);
  await pool.end();
  process.exit(1);
});
