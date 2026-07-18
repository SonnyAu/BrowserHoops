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
          <div className="brand-mark">Browser Hoops</div>
          <h1>Career saves</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Basketball GM–style solo MyCareer. Manage one player from recruiting through retirement.
          </p>
        </div>
        <div className="row">
          <label className="btn">
            Import save
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
            />
          </label>
          <label className="btn">
            Validate league JSON
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && onImportLeague(e.target.files[0])}
            />
          </label>
          <Link className="btn primary" to="/new/create">
            Create new career
          </Link>
        </div>
      </div>

      <div className="panel">
        {saves.length === 0 ? (
          <div className="empty">No saves in IndexedDB yet. Create a career to get started.</div>
        ) : (
          <table className="save-table">
            <thead>
              <tr>
                <th>Career</th>
                <th>Phase</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {saves.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="btn ghost" disabled={busy} onClick={() => open(s.id)}>
                      <strong>{s.name}</strong>
                      {s.customized ? <span className="tag warn" style={{ marginLeft: 8 }}>Customized</span> : null}
                    </button>
                  </td>
                  <td className="muted">{s.phase ?? '—'}</td>
                  <td className="muted mono">{new Date(s.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="row">
                      <button className="btn" onClick={() => open(s.id)}>Continue</button>
                      <button className="btn" onClick={() => onRename(s.id)}>Rename</button>
                      <button className="btn" onClick={() => onDuplicate(s.id)}>Duplicate</button>
                      <button className="btn" onClick={() => onExport(s.id)}>Export</button>
                      <button className="btn danger" onClick={() => onDelete(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
