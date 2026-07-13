/* ============================================================
 * MoWISE WiseGame Bridge v1.0 (2026-07-10)
 * 各ゲームに埋め込み、iframe親(MoWISE portal)へスコアを送信する。
 * 契約: src/lib/game-sdk.ts (source:'mowise-game',
 *       GAME_READY / GAME_SCORE / GAME_COMPLETE / GAME_EXIT)
 * スタンドアロン起動時(親なし)は何もしない=単体でも安全。
 * ============================================================ */
(function () {
  if (window.WiseGame) return;

  window.WiseGame = {
    gameId: null,
    _ctx: {},

    init: function (config) {
      config = config || {};
      if (config.gameId) this.gameId = config.gameId;
      this._send('GAME_READY', { gameId: this.gameId, version: config.version || '1.0' });
    },

    reportScore: function (data) {
      this._send('GAME_SCORE', this._merge(data));
    },

    reportComplete: function (data) {
      var payload = this._merge(data);
      payload.completed = true;
      this._send('GAME_COMPLETE', payload);
    },

    exit: function () {
      this._send('GAME_EXIT', { gameId: this.gameId });
    },

    _merge: function (data) {
      var out = { gameId: this.gameId };
      var k;
      for (k in this._ctx) out[k] = this._ctx[k];
      for (k in (data || {})) out[k] = data[k];
      return out;
    },

    _send: function (type, payload) {
      try {
        if (window.parent !== window) {
          window.parent.postMessage(
            { type: type, payload: payload, source: 'mowise-game' }, '*'
          );
        }
      } catch (e) {}
    }
  };

  window.addEventListener('message', function (e) {
    if (e.data && e.data.source === 'mowise-parent' && e.data.type === 'INIT_GAME') {
      var p = e.data.payload || {};
      if (p.gameId) window.WiseGame.gameId = p.gameId;
      window.WiseGame._ctx = { assignmentId: p.assignmentId, classId: p.classId };
    }
  });
})();
