
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import "./App.css";


const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});


const EMPTY_FORM = {
  username: "",
  name: "",
  followers: 0,
  following: 0,
  posts: 0,
  accountAgeDays: 0,
  engagementRate: 0,
  profileCompleteness: 0,
  verified: false,
};

function getErrorMessage(error) {
  const data = error.response?.data;
  if (typeof data === "string") return data;
  return data?.message || data?.error || error.message || "Something went wrong.";
}

function isDuplicateError(error) {
  const message = getErrorMessage(error);
  return (
    error.response?.status === 409 ||
    /duplicate|already exists|already added|e11000|username.*taken/i.test(
      message
    )
  );
}

function riskLevel(account) {
  return String(account.riskLevel || "").toUpperCase();
}

function formatProbability(account) {
  const value = account.fakeProbability;
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  // The ML API returns probability on a 0–1 scale.
  return `${(number * 100).toFixed(1)}%`;
}

function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [activePage, setActivePage] = useState("analysis");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(true);

  const [alertPopup, setAlertPopup] = useState(null);
  const [notice, setNotice] = useState("");

  const showAlert = (title, message, type = "error") => {
    setAlertPopup({ title, message, type });
  };

  const loadAccounts = useCallback(async () => {
    try {
      const response = await api.get("/accounts");
      const payload = response.data;
      const list = Array.isArray(payload)
        ? payload
        : payload?.data || payload?.accounts || [];

      setAccounts(list);
    } catch (error) {
      showAlert(
        "CONNECTION ERROR",
        `Unable to load accounts. ${getErrorMessage(error)}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!autoRefresh) return undefined;

    const timer = window.setInterval(() => {
      loadAccounts();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, loadAccounts]);

  const openAddForm = () => {
    setEditingAccount(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
    setNotice("");
  };

  const openEditForm = (account) => {
    setEditingAccount(account);
    setForm({
      ...EMPTY_FORM,
      ...account,
      verified: Boolean(account.verified),
    });
    setShowForm(true);
    setNotice("");
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingAccount(null);
    setForm({ ...EMPTY_FORM });
  };

  const updateField = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const saveAccount = async (event) => {
    event.preventDefault();

    const username = String(form.username || "").trim();
    if (!username) {
      showAlert(
        "USERNAME REQUIRED",
        "Enter a username before saving this account."
      );
      return;
    }

    const numericFields = [
      "followers",
      "following",
      "posts",
      "accountAgeDays",
      "engagementRate",
      "profileCompleteness",
    ];

    for (const field of numericFields) {
      const value = Number(form[field]);

      if (!Number.isFinite(value) || value < 0) {
        showAlert(
          "INVALID INPUT",
          `${field} must be a valid, non-negative number.`
        );
        return;
      }
    }

    if (
      Number(form.engagementRate) > 100 ||
      Number(form.profileCompleteness) > 100
    ) {
      showAlert(
        "INVALID PERCENTAGE",
        "Engagement rate and profile completeness must be between 0 and 100."
      );
      return;
    }

    const payload = {
      ...form,
      username,
      name: String(form.name || "").trim(),
      followers: Number(form.followers),
      following: Number(form.following),
      posts: Number(form.posts),
      accountAgeDays: Number(form.accountAgeDays),
      engagementRate: Number(form.engagementRate),
      profileCompleteness: Number(form.profileCompleteness),
      verified: Boolean(form.verified),
    };

    setSaving(true);
    setNotice("");

    try {
      if (editingAccount) {
        await api.put(`/accounts/${editingAccount._id || editingAccount.id}`, payload);
        setNotice("Account updated successfully.");
      } else {
        await api.post("/accounts", payload);
        setNotice("Account added successfully.");
      }

      setShowForm(false);
      setEditingAccount(null);
      setForm({ ...EMPTY_FORM });
      await loadAccounts();
    } catch (error) {
      if (!editingAccount && isDuplicateError(error)) {
        showAlert(
          "ACCOUNT ALREADY ADDED",
          `The username "@${username}" already exists in Sentinel AI. Try a different username.`
        );
      } else {
        showAlert(
          editingAccount ? "UPDATE FAILED" : "ACCOUNT CREATION FAILED",
          getErrorMessage(error)
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const analyzeAccount = async (account) => {
    const id = account._id || account.id;
    setAnalyzingId(id);
    setNotice("");

    try {
      await api.post(`/accounts/${id}/analyze`);
      await loadAccounts();
      setNotice(`Analysis completed for @${account.username}.`);
    } catch (error) {
      showAlert("ANALYSIS FAILED", getErrorMessage(error));
    } finally {
      setAnalyzingId(null);
    }
  };

  const deleteAccount = async (account) => {
    const id = account._id || account.id;

    if (
      confirmDelete &&
      !window.confirm(
        `Delete @${account.username}? This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(id);
    setNotice("");

    try {
      await api.delete(`/accounts/${id}`);
      setNotice(`@${account.username} was deleted.`);
      await loadAccounts();
    } catch (error) {
      showAlert("DELETE FAILED", getErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const exportCSV = () => {
    const headers = [
      "Username",
      "Name",
      "Followers",
      "Following",
      "Posts",
      "Account Age Days",
      "Engagement Rate",
      "Profile Completeness",
      "Verified",
      "Risk Score",
      "Risk Level",
      "Fake Probability",
    ];

    const rows = filteredAccounts.map((account) =>
      [
        account.username,
        account.name,
        account.followers,
        account.following,
        account.posts,
        account.accountAgeDays,
        account.engagementRate,
        account.profileCompleteness,
        account.verified,
        account.riskScore ?? "",
        account.riskLevel ?? "",
        account.fakeProbability ?? "",
      ].map((value) => {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
      })
    );

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "sentinel-ai-accounts.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setNotice("CSV export completed.");
  };

  const filteredAccounts = accounts.filter((account) => {
    const query = search.toLowerCase();
    const matchesSearch =
      String(account.username || "").toLowerCase().includes(query) ||
      String(account.name || "").toLowerCase().includes(query);

    const matchesRisk =
      riskFilter === "ALL" || riskLevel(account) === riskFilter;

    return matchesSearch && matchesRisk;
  });

  const analyzedAccounts = accounts.filter(
    (account) => account.riskScore !== null &&
      account.riskScore !== undefined
  );

  const lowCount = analyzedAccounts.filter(
    (account) => riskLevel(account) === "LOW"
  ).length;
  const mediumCount = analyzedAccounts.filter(
    (account) => riskLevel(account) === "MEDIUM"
  ).length;
  const highCount = analyzedAccounts.filter(
    (account) => riskLevel(account) === "HIGH"
  ).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <div>
            <h2>SENTINEL<span>AI</span></h2>
            <small>THREAT INTELLIGENCE</small>
          </div>
        </div>

        <div className="sidebar-status">
          <span className="status-dot" />
          SYSTEM ONLINE
        </div>

        <p className="nav-heading">OPERATIONS</p>

        <nav className="sidebar-nav">
          <button
            className={activePage === "analysis" ? "active" : ""}
            onClick={() => setActivePage("analysis")}
          >
            <span>▦</span> Account Analysis
          </button>
          <button
            className={activePage === "risk" ? "active" : ""}
            onClick={() => setActivePage("risk")}
          >
            <span>◈</span> Risk Monitoring
          </button>
          <button
            className={activePage === "model" ? "active" : ""}
            onClick={() => setActivePage("model")}
          >
            <span>⌘</span> Model Overview
          </button>
          <button
            className={activePage === "settings" ? "active" : ""}
            onClick={() => setActivePage("settings")}
          >
            <span>⚙</span> Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot" />
          <div>
            <strong>ML ENGINE</strong>
            <small>Random Forest / API</small>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">SENTINEL CYBER OPS / CONSOLE</p>
            <h1>
              {activePage === "analysis" && "Threat Intelligence"}
              {activePage === "risk" && "Risk Monitoring"}
              {activePage === "model" && "Model Overview"}
              {activePage === "settings" && "System Settings"}
            </h1>
          </div>
          <div className="topbar-right">
            <span className="live-indicator">
              <span className="status-dot" /> LIVE
            </span>
            <span className="topbar-tag">SECURE CONSOLE</span>
          </div>
        </header>

        {notice && (
          <div className="success-notice" role="status">
            <span>✓</span> {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss notice">
              ×
            </button>
          </div>
        )}

        {activePage === "analysis" && (
          <>
            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">TOTAL ACCOUNTS</span>
                <strong>{accounts.length}</strong>
                <small>Stored in database</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">ANALYZED</span>
                <strong>{analyzedAccounts.length}</strong>
                <small>ML analysis completed</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">HIGH RISK</span>
                <strong className="text-danger">{highCount}</strong>
                <small>Requires review</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">LOW RISK</span>
                <strong className="text-green">{lowCount}</strong>
                <small>Lower model-assigned risk</small>
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">ACCOUNT DATABASE</p>
                  <h2>Social Media Accounts</h2>
                  <p className="muted">
                    Manage profiles and run machine-learning risk analysis.
                  </p>
                </div>
                <button className="cyber-primary" onClick={openAddForm}>
                  + Add Account
                </button>
              </div>

              <div className="toolbar">
                <input
                  className="search-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search username or name..."
                  aria-label="Search accounts"
                />
                <select
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value)}
                  aria-label="Filter by risk level"
                >
                  <option value="ALL">All risk levels</option>
                  <option value="LOW">Low risk</option>
                  <option value="MEDIUM">Medium risk</option>
                  <option value="HIGH">High risk</option>
                </select>
                <button className="cyber-secondary" onClick={exportCSV}>
                  ↓ Export CSV
                </button>
              </div>

              {loading ? (
                <div className="empty-state">Loading account database...</div>
              ) : filteredAccounts.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">⌕</span>
                  <h3>No accounts found</h3>
                  <p>Try a different search or add a new test account.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Followers</th>
                        <th>Following</th>
                        <th>Posts</th>
                        <th>Risk Score</th>
                        <th>Risk Level</th>
                        <th>Fake Probability</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map((account) => {
                        const id = account._id || account.id;
                        const level = riskLevel(account);
                        const hasAnalysis =
                          account.riskScore !== null &&
                          account.riskScore !== undefined;

                        return (
                          <tr key={id}>
                            <td>
                              <div className="account-cell">
                                <div className="account-avatar">
                                  {String(account.username || "?")
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                                <div>
                                  <strong>{account.name || account.username}</strong>
                                  <small>@{account.username}</small>
                                </div>
                              </div>
                            </td>
                            <td>{Number(account.followers || 0).toLocaleString()}</td>
                            <td>{Number(account.following || 0).toLocaleString()}</td>
                            <td>{Number(account.posts || 0).toLocaleString()}</td>
                            <td>
                              {hasAnalysis ? `${account.riskScore}%` : "—"}
                            </td>
                            <td>
                              {hasAnalysis ? (
                                <span className={`risk-badge risk-${level.toLowerCase()}`}>
                                  {level || "UNKNOWN"}
                                </span>
                              ) : (
                                <span className="risk-badge risk-pending">
                                  PENDING
                                </span>
                              )}
                            </td>
                            <td>{formatProbability(account)}</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="action-button analyze-button"
                                  disabled={analyzingId === id}
                                  onClick={() => analyzeAccount(account)}
                                >
                                  {analyzingId === id ? "Analyzing..." : "Analyze"}
                                </button>
                                <button
                                  className="action-button edit-button"
                                  onClick={() => openEditForm(account)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="action-button delete-button"
                                  disabled={deletingId === id}
                                  onClick={() => deleteAccount(account)}
                                >
                                  {deletingId === id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="table-footer">
                <span>{filteredAccounts.length} account(s) shown</span>
                <span>
                  <i className="status-dot" /> Database connected through API
                </span>
              </div>
            </section>
          </>
        )}

        {activePage === "risk" && (
          <>
            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">HIGH RISK</span>
                <strong className="text-danger">{highCount}</strong>
                <small>Model classification: HIGH</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">MEDIUM RISK</span>
                <strong className="text-warning">{mediumCount}</strong>
                <small>Model classification: MEDIUM</small>
              </div>
              <div className="stat-card">
                <span className="stat-label">LOW RISK</span>
                <strong className="text-green">{lowCount}</strong>
                <small>Model classification: LOW</small>
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">THREAT OVERVIEW</p>
                  <h2>Analyzed Accounts</h2>
                  <p className="muted">
                    These categories reflect model output, not verified account authenticity.
                  </p>
                </div>
              </div>
              <div className="risk-summary-grid">
                {["HIGH", "MEDIUM", "LOW"].map((level) => {
                  const count = analyzedAccounts.filter(
                    (account) => riskLevel(account) === level
                  ).length;
                  const percent = analyzedAccounts.length
                    ? (count / analyzedAccounts.length) * 100
                    : 0;

                  return (
                    <div className="risk-summary-card" key={level}>
                      <span className={`risk-badge risk-${level.toLowerCase()}`}>
                        {level} RISK
                      </span>
                      <strong>{count}</strong>
                      <div className="risk-progress">
                        <span
                          className={`progress-${level.toLowerCase()}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <small>{percent.toFixed(1)}% of analyzed accounts</small>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {activePage === "model" && (
          <section className="panel model-panel">
            <p className="eyebrow">MACHINE LEARNING / CLASSIFICATION</p>
            <h2>Random Forest Detection Engine</h2>
            <p className="muted">
              The model estimates whether a profile resembles fake or genuine
              examples in its training dataset. It does not independently verify
              a social media account.
            </p>

            <div className="model-grid">
              <div className="model-info-card">
                <span>MODEL TYPE</span>
                <strong>Random Forest</strong>
              </div>
              <div className="model-info-card">
                <span>ESTIMATORS</span>
                <strong>200 trees</strong>
              </div>
              <div className="model-info-card">
                <span>OUTPUT</span>
                <strong>Probability + label</strong>
              </div>
            </div>

            <h3>Features supplied to the model</h3>
            <div className="feature-list">
              {[
                ["statuses_count", "Number of posts/statuses"],
                ["followers_count", "Number of followers"],
                ["friends_count", "Number of followed accounts"],
                ["favourites_count", "Favourite count"],
                ["listed_count", "Number of public lists"],
              ].map(([name, description]) => (
                <div className="feature-row" key={name}>
                  <code>{name}</code>
                  <span>{description}</span>
                </div>
              ))}
            </div>

            <div className="info-note">
              <strong>Model limitation:</strong> A high test score on the
              training dataset does not guarantee performance on real-world
              profiles. Validate on representative, independently labeled data.
            </div>
          </section>
        )}

        {activePage === "settings" && (
          <section className="panel settings-panel">
            <p className="eyebrow">CONSOLE CONFIGURATION</p>
            <h2>System Settings</h2>

            <div className="setting-row">
              <div>
                <strong>Automatic refresh</strong>
                <p className="muted">
                  Reload accounts every 30 seconds while this page is open.
                </p>
              </div>
              <label className="toggle-control">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                />
                <span>{autoRefresh ? "ON" : "OFF"}</span>
              </label>
            </div>

            <div className="setting-row">
              <div>
                <strong>Confirm before deletion</strong>
                <p className="muted">
                  Ask for confirmation before deleting an account.
                </p>
              </div>
              <label className="toggle-control">
                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(event) => setConfirmDelete(event.target.checked)}
                />
                <span>{confirmDelete ? "ON" : "OFF"}</span>
              </label>
            </div>

            <div className="setting-row">
              <div>
                <strong>Refresh account data</strong>
                <p className="muted">
                  Request the latest account list from your backend.
                </p>
              </div>
              <button className="cyber-secondary" onClick={loadAccounts}>
                Refresh Now
              </button>
            </div>
          </section>
        )}

        <footer className="app-footer">
          <span>SENTINEL AI // CYBER OPS CONSOLE</span>
          <span>AI predictions are indicators, not proof of fraud.</span>
        </footer>
      </main>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}>
          <form className="account-form" onSubmit={saveAccount}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PROFILE MANAGEMENT</p>
                <h2>{editingAccount ? "Edit Account" : "Add Account"}</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeForm}
                aria-label="Close form"
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <label className="form-field">
                Username *
                <input
                  name="username"
                  value={form.username}
                  onChange={updateField}
                  placeholder="e.g. test_profile_01"
                  required
                />
              </label>

              <label className="form-field">
                Display name
                <input
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  placeholder="Account display name"
                />
              </label>

              {[
                ["followers", "Followers"],
                ["following", "Following"],
                ["posts", "Posts"],
                ["accountAgeDays", "Account age (days)"],
                ["engagementRate", "Engagement rate (%)"],
                ["profileCompleteness", "Profile completeness (%)"],
              ].map(([name, label]) => (
                <label className="form-field" key={name}>
                  {label}
                  <input
                    type="number"
                    name={name}
                    min="0"
                    max={
                      name === "engagementRate" ||
                      name === "profileCompleteness"
                        ? "100"
                        : undefined
                    }
                    step={name.includes("Rate") || name === "profileCompleteness" ? "0.1" : "1"}
                    value={form[name]}
                    onChange={updateField}
                    required
                  />
                </label>
              ))}
            </div>

            <label className="verified-field">
              <input
                type="checkbox"
                name="verified"
                checked={Boolean(form.verified)}
                onChange={updateField}
              />
              Verified account
            </label>

            <div className="form-actions">
              <button
                type="button"
                className="cyber-secondary"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="cyber-primary"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingAccount
                    ? "Save Changes"
                    : "Add Account"}
              </button>
            </div>
          </form>
        </div>
      )}

      {alertPopup && (
        <div
          className="cyber-alert-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAlertPopup(null);
          }}
        >
          <div
            className={`cyber-alert ${
              alertPopup.type === "success" ? "cyber-alert-success" : ""
            }`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cyber-alert-title"
            aria-describedby="cyber-alert-message"
          >
            <div className="cyber-alert-icon">
              {alertPopup.type === "success" ? "✓" : "!"}
            </div>

            <p className="cyber-alert-label">SYSTEM NOTIFICATION</p>
            <h2 id="cyber-alert-title">{alertPopup.title}</h2>
            <p id="cyber-alert-message" className="cyber-alert-message">
              {alertPopup.message}
            </p>

            <button
              type="button"
              className="cyber-alert-button"
              onClick={() => setAlertPopup(null)}
              autoFocus
            >
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
