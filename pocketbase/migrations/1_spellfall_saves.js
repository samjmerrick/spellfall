/// <reference path="../pb_data/types.d.ts" />
// Cloud saves for Spellfall: one record per user and slot (1 or 2). bin/deploy (~/apps) copies this file to
// pb_migrations/spellfall_1_spellfall_saves.js. Owner-only API rules; see src/save/cloud.ts for how the game uses it.
migrate(
  (app) => {
    // Idempotent: the same collection may already exist if this app was deployed under another name first.
    try {
      app.findCollectionByNameOrId('spellfall_saves');
      return;
    } catch (_) {}

    const users = app.findCollectionByNameOrId('users');
    const mine = 'user = @request.auth.id';
    const c = new Collection({
      type: 'base',
      name: 'spellfall_saves',
      listRule: mine,
      viewRule: mine,
      createRule: "@request.auth.id != '' && user = @request.auth.id",
      // The owner may edit their record but not hand it to another user.
      updateRule: mine + ' && (@request.body.user:isset = false || @request.body.user = @request.auth.id)',
      deleteRule: mine,
      fields: [
        {
          type: 'relation',
          name: 'user',
          required: true,
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        // 1 or 2 (a required number cannot be 0).
        { type: 'number', name: 'slot', required: true, min: 1, max: 2, onlyInt: true },
        // When the profile in `data` was last changed on a device (ms since the epoch); the newest copy wins.
        { type: 'number', name: 'updatedAt', required: true, onlyInt: true },
        { type: 'number', name: 'schemaVersion', required: true, onlyInt: true },
        // The profile (validated by the game's Zod schema and migrations when pulled), up to 5 MB.
        { type: 'json', name: 'data', required: true, maxSize: 5242880 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_spellfall_saves_user_slot ON spellfall_saves (user, slot)'],
    });
    app.save(c);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('spellfall_saves'));
    } catch (_) {}
  },
);
