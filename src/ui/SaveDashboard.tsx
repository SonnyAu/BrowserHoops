import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  adaptExternalLeagueJson,
  parseBasketballSoloCareerLeague,
} from '../importers/leagueFormat';
import {
  deleteCareer,
  downloadText,
  duplicateCareer,
  exportSaveJson,
  importSaveJson,
  listSaves,
  loadCareer,
  loadGameLogs,
  loadLeagueGames,
  renameCareer,
  SaveMeta,
} from '../persistence/db';

export function SaveDashboard() {
  const nav = useNavigate();
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setSaves(await listSaves());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function open(id: string) {
    nav(`/career/${id}/home`);
  }

  async function onRename(id: string) {
    const name = prompt('Rename save');
    if (!name) return;
    await renameCareer(id, name);
    await refresh();
  }

  async function onDuplicate(id: string) {
    setBusy(true);
    await duplicateCareer(id);
    await refresh();
    setBusy(false);
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this career save?')) return;
    await deleteCareer(id);
    await refresh();
  }

  async function onExport(id: string) {
    const save = await loadCareer(id);
    if (!save) return;
    const logs = await loadGameLogs(id);
    const leagueGames = await loadLeagueGames(id);
    downloadText(`${save.name.replace(/\s+/g, '_')}.json`, exportSaveJson(save, logs, leagueGames));
  }

  async function onImport(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const save = await importSaveJson(text);
      await refresh();
      nav(`/career/${save.id}/home`);
    } catch (e) {
      alert(String(e));
    }
    setBusy(false);
  }

  async function onImportLeague(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      const report =
        raw?.format === 'BasketballSoloCareerLeague'
          ? parseBasketballSoloCareerLeague(raw)
          : adaptExternalLeagueJson(raw);
      alert(
        `League import: ${report.teams.length} teams, ${report.players.length} players, ${report.colleges.length} colleges.\n` +
          `Warnings: ${report.warnings.length}. Errors: ${report.errors.length}.\n` +
          `(Validated into canonical model; bundled league data remains the live pack.)`,
      );
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <div className="brand-mark">Solo MyCareer · HS → College → NBA</div>
          <h1>Browser Hoops</h1>
          <p className="dashboard-tagline">
            One player, one story — from recruiting boards to draft night to the last dance.
            Pick a career below or lace up a new one.
          </p>
        </div>
        <div className="row">
          <label className="btn ghost">
            Import save
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
            />
          </label>
          <label className="btn ghost">
            Validate league JSON
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && onImportLeague(e.target.files[0])}
            />
          </label>
          <Link className="btn primary" to="/new/create">
            + New career
          </Link>
        </div>
      </div>

      {saves.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <p style={{ fontSize: 40, margin: '0 0 8px' }}>🏀</p>
            <p style={{ margin: '0 0 12px' }}>
              No careers yet. Every legend starts as an unranked kid in a driveway.
            </p>
            <Link className="btn primary" to="/new/create">
              Create your player
            </Link>
          </div>
        </div>
      ) : (
        <div className="save-grid">
          {saves.map((s) => (
            <div className="save-card" key={s.id}>
              <button className="save-card-name" disabled={busy} onClick={() => open(s.id)}>
                {s.name}
              </button>
              <div className="save-card-meta">
                <span className="tag">{s.phase ?? 'new'}</span>
                {s.customized ? <span className="tag warn">Customized</span> : null}
                <span className="mono">{new Date(s.updatedAt).toLocaleString()}</span>
              </div>
              <div className="save-card-actions">
                <button className="btn primary" disabled={busy} onClick={() => open(s.id)}>
                  Continue
                </button>
                <button className="btn" onClick={() => onRename(s.id)}>Rename</button>
                <button className="btn" onClick={() => onDuplicate(s.id)}>Duplicate</button>
                <button className="btn" onClick={() => onExport(s.id)}>Export</button>
                <button className="btn danger" onClick={() => onDelete(s.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
