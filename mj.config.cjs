/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  entityPackageName: '@mj-biz-apps/secure-messaging-entities',

  testing: {
    checkModules: ['@mj-biz-apps/secure-messaging-integration-tests'],
  },

  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    { type: 'EntitySubclasses', directory: './packages/Entities/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/Actions/src/generated' },
    { type: 'GraphQLServer', directory: './packages/Server/src/generated' },
    {
      type: 'Angular',
      directory: './packages/Angular/src/lib/generated',
      // `maxComponentsPerModule` no longer decides how components are split. Since MJ
      // 6.1.0-edge.6 the generator buckets each form by FNV-1a hash of its class name
      // modulo `submoduleCount` (default 32), so our 6 forms land in 5 sparse submodules
      // regardless of this value. It survives only as a soft-limit WARNING threshold —
      // logged when a bucket exceeds it, which 6 forms across 32 buckets never will.
      // Kept rather than deleted so a future schema growing past 20 forms in one bucket
      // still gets the warning; raise `submoduleCount` if that ever fires.
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],

  commands: [
    {
      workingDirectory: './packages/Entities',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
    {
      workingDirectory: './packages/Actions',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
  ],

  // Allow-list: CodeGen this app's schema only (MJ >= 5.50 includeSchemas).
  // Unnamed schemas — core, siblings, never-seen client schemas — are excluded.
  includeSchemas: ['__mj_BizAppsSecureMessaging'],
  excludeSchemas: [],

  // SQL output with Flyway placeholders. The app's own schema maps to ${flyway:defaultSchema}
  // (resolved at migrate time); core MJ uses the named ${mjSchema} placeholder.
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/codegen/',
    appendToFile: false,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: false,
    schemaPlaceholders: [
      // Order matters: more-specific schema first (greedy sequential substitution),
      // else '__mj' would match the '__mj' prefix of '__mj_BizAppsSecureMessaging'.
      { schema: '__mj_BizAppsSecureMessaging', placeholder: '${flyway:defaultSchema}' },
      { schema: '__mj', placeholder: '${mjSchema}' }
    ]
  },

  // New entities in our schema get the 'MJ_BizApps_SecureMessaging: ' prefix — MUST match the
  // names our hand-written code already references (RunView/GetEntityObject) and metadata.
  newEntityDefaults: {
    NameRulesBySchema: [
      { SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' },
      {
        SchemaName: '__mj_BizAppsSecureMessaging',
        EntityNamePrefix: 'MJ_BizApps_SecureMessaging: ',
        EntityNameSuffix: '',
      }
    ]
  },

  dbHost: process.env.DB_HOST ?? 'localhost',
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
  dbDatabase: process.env.DB_DATABASE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  codeGenLogin: process.env.CODEGEN_DB_USERNAME,
  codeGenPassword: process.env.CODEGEN_DB_PASSWORD,
};
