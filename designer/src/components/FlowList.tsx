import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { Project, Flow } from '../types';
import { supabase } from '../lib/supabase';
import { Dropdown } from './Dropdown';
import { ConfirmModal } from './ConfirmModal';
import { FlowCompareModal } from './FlowCompareModal';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const suffix = [, 'st', 'nd', 'rd'][day % 10 > 3 ? 0 : (day % 100 - day % 10 !== 10 ? day % 10 : 0)] || 'th';
  const month = d.toLocaleString('en', { month: 'short' });
  const year = d.getFullYear();
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${day}${suffix} ${month} ${year}, ${h12.toString().padStart(2, '0')}:${mins} ${ampm}`;
}

interface FlowWithCount extends Flow {
  screen_count?: number;
}

interface FlowListProps {
  user: User;
}

export function FlowList({ user: _user }: FlowListProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [flows, setFlows] = useState<FlowWithCount[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [editingFlowName, setEditingFlowName] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [comparePair, setComparePair] = useState<[Flow, Flow] | null>(null);
  const editRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId) loadData();
  }, [projectId]);

  React.useEffect(() => {
    if (editingFlowId && editRef.current) { editRef.current.focus(); editRef.current.select(); }
  }, [editingFlowId]);

  async function loadData() {
    setLoading(true);

    const [projectRes, flowsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('flows').select('*').eq('project_id', projectId).order('created_at'),
    ]);

    if (projectRes.data) setProject(projectRes.data);

    if (flowsRes.data) {
      const withCounts: FlowWithCount[] = await Promise.all(
        flowsRes.data.map(async (f: Flow) => {
          const { count } = await supabase
            .from('screenshots')
            .select('*', { count: 'exact', head: true })
            .eq('flow_id', f.id);
          return { ...f, screen_count: count ?? 0 };
        }),
      );
      setFlows(withCounts);
    }

    setLoading(false);
  }

  const filteredFlows = useMemo(() => {
    return flows.filter((f) => {
      const matchesSearch = !searchQuery ||
        f.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = !filterPlatform || f.platform === filterPlatform;
      return matchesSearch && matchesPlatform;
    });
  }, [flows, searchQuery, filterPlatform]);

  const selectedCompareFlows = useMemo(() => {
    return compareSelection
      .map((id) => flows.find((flow) => flow.id === id))
      .filter((flow): flow is Flow => Boolean(flow));
  }, [compareSelection, flows]);

  const compareReady = selectedCompareFlows.length === 2;

  function toggleCompareMode() {
    setCompareMode((active) => {
      const nextActive = !active;
      if (!nextActive) {
        setCompareSelection([]);
        setComparePair(null);
      }
      return nextActive;
    });
  }

  function toggleCompareSelection(flowId: string) {
    setCompareSelection((current) => {
      if (current.includes(flowId)) return current.filter((id) => id !== flowId);
      if (current.length < 2) return [...current, flowId];
      return [current[1], flowId];
    });
  }

  function openCompareModal() {
    if (!compareReady) return;
    const [left, right] = selectedCompareFlows;
    if (!left || !right) return;
    setComparePair([left, right]);
  }

  function closeCompareModal() {
    setComparePair(null);
    setCompareSelection([]);
    setCompareMode(false);
  }

  async function createFlow() {
    if (!newName.trim() || !projectId) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('flows')
      .insert({ name: newName.trim(), project_id: projectId })
      .select()
      .single();

    setCreating(false);
    setNewName('');
    setShowInput(false);

    if (data && !error) {
      navigate(`/project/${projectId}/flow/${data.id}`);
    }
  }

  async function renameFlow(id: string) {
    const trimmed = editingFlowName.trim();
    if (trimmed && trimmed !== flows.find((f) => f.id === id)?.name) {
      await supabase.from('flows').update({ name: trimmed }).eq('id', id);
      setFlows((prev) => prev.map((f) => f.id === id ? { ...f, name: trimmed } : f));
    }
    setEditingFlowId(null);
  }

  async function changeFlowPlatform(id: string, platform: 'mobile' | 'web' | null) {
    await supabase.from('flows').update({ platform }).eq('id', id);
    setFlows((prev) => prev.map((f) => f.id === id ? { ...f, platform } : f));
  }

  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null);

  async function confirmDeleteFlow() {
    if (!deleteFlowId) return;
    await supabase.from('flows').delete().eq('id', deleteFlowId);
    setFlows((prev) => prev.filter((f) => f.id !== deleteFlowId));
    setDeleteFlowId(null);
  }

  if (loading) {
    return (
      <div className="flow-list-page">
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading flows...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-list-page">
      <header className="flow-list-header">
        <div className="header-left">
          <button className="toolbar-btn toolbar-btn-back" onClick={() => navigate('/')} title="Back to projects">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <h1 className="flow-list-project-name">{project?.name || 'Project'}</h1>
        <div className="header-right" />
      </header>

      <main className="flow-list-main">
        <div className="flow-list-actions">
          <h2 className="flow-list-title">Flows</h2>
          <div className="flow-list-compare-controls">
            <button className={`btn-secondary ${compareMode ? 'flow-list-compare-toggle-active' : ''}`} onClick={toggleCompareMode}>
              {compareMode ? 'Exit compare' : 'Compare flows'}
            </button>
            {compareMode && (
              <>
                <span className="flow-list-compare-count">{compareSelection.length}/2 selected</span>
                <button className="btn-secondary" onClick={() => setCompareSelection([])} disabled={compareSelection.length === 0}>
                  Clear
                </button>
                <button className="btn-primary" onClick={openCompareModal} disabled={!compareReady}>
                  Compare selected
                </button>
              </>
            )}
          </div>
          <div className="flow-list-filters">
            <div className="flow-list-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search flows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Dropdown
              value={filterPlatform}
              placeholder="All Platforms"
              options={[
                { value: 'mobile', label: 'Mobile' },
                { value: 'web', label: 'Web' },
              ]}
              onChange={setFilterPlatform}
            />
          </div>
          {showInput ? (
            <div className="new-project-input">
              <input
                type="text"
                placeholder="Flow name (e.g., Login Flow)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFlow()}
                autoFocus
              />
              <button className="btn-primary" onClick={createFlow} disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button className="btn-secondary" onClick={() => setShowInput(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setShowInput(true)}>
              + New Flow
            </button>
          )}
        </div>

        {flows.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <h2>No flows yet</h2>
            <p>Create a flow to start mapping screens and connections.</p>
          </div>
        ) : filteredFlows.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <h2>No matching flows</h2>
            <p>Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className="project-grid">
            {filteredFlows.map((flow) => (
              <div
                key={flow.id}
                className={`project-card ${compareMode ? 'flow-card--compare' : ''} ${compareSelection.includes(flow.id) ? 'flow-card--selected' : ''}`}
                onClick={() => {
                  if (compareMode) {
                    toggleCompareSelection(flow.id);
                    return;
                  }
                  navigate(`/project/${projectId}/flow/${flow.id}`);
                }}
              >
                {compareMode && (
                  <div className={`flow-compare-badge ${compareSelection.includes(flow.id) ? 'flow-compare-badge-selected' : ''}`}>
                    {compareSelection.includes(flow.id) ? 'Selected' : 'Select'}
                  </div>
                )}
                <div className="project-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div className="flow-card-name-row">
                  {editingFlowId === flow.id ? (
                    <input
                      ref={editRef}
                      className="flow-card-edit"
                      value={editingFlowName}
                      onChange={(e) => setEditingFlowName(e.target.value)}
                      onBlur={() => renameFlow(flow.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameFlow(flow.id);
                        if (e.key === 'Escape') setEditingFlowId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <h3>{flow.name}</h3>
                      <button
                        className="flow-card-rename-btn"
                        title="Rename flow"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFlowId(flow.id);
                          setEditingFlowName(flow.name);
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                <div className="flow-card-meta">
                  <div className="flow-card-platform" onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      className="flow-card-platform-dropdown"
                      value={flow.platform || null}
                      placeholder="No platform"
                      options={[
                        { value: 'mobile', label: 'Mobile' },
                        { value: 'web', label: 'Web' },
                      ]}
                      onChange={(v) => changeFlowPlatform(flow.id, (v || null) as 'mobile' | 'web' | null)}
                    />
                  </div>
                  <p className="project-date">
                    {(flow.screen_count ?? 0)} screen{flow.screen_count !== 1 ? 's' : ''} · {formatDate(flow.updated_at)}
                  </p>
                  <button
                    className="flow-card-text-link"
                    title="Build or edit this flow using text"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/project/${projectId}/flow/${flow.id}/text`);
                    }}
                    disabled={compareMode}
                  >
                    Text Studio
                  </button>
                </div>
                <button
                  className="project-delete"
                  onClick={(e) => { e.stopPropagation(); setDeleteFlowId(flow.id); }}
                  title="Delete flow"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {comparePair && (
        <FlowCompareModal
          flowA={comparePair[0]}
          flowB={comparePair[1]}
          onClose={closeCompareModal}
        />
      )}

      {deleteFlowId && (
        <ConfirmModal
          title="Delete Flow"
          message={`Delete "${flows.find((f) => f.id === deleteFlowId)?.name || 'this flow'}" and all its screens?`}
          onConfirm={confirmDeleteFlow}
          onCancel={() => setDeleteFlowId(null)}
        />
      )}
    </div>
  );
}
