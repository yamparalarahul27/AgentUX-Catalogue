import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { Project, Flow } from '../types';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    if (projectId) loadData();
  }, [projectId]);

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

  async function deleteFlow(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this flow and all its screens?')) return;

    await supabase.from('flows').delete().eq('id', id);
    setFlows((prev) => prev.filter((f) => f.id !== id));
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
          <h1>{project?.name || 'Project'}</h1>
        </div>
      </header>

      <main className="flow-list-main">
        <div className="flow-list-actions">
          <h2 className="flow-list-title">Flows</h2>
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
        ) : (
          <div className="project-grid">
            {flows.map((flow) => (
              <div
                key={flow.id}
                className="project-card"
                onClick={() => navigate(`/project/${projectId}/flow/${flow.id}`)}
              >
                <div className="project-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <h3>{flow.name}</h3>
                <p className="project-date">
                  {(flow.screen_count ?? 0)} screen{flow.screen_count !== 1 ? 's' : ''} · {formatDate(flow.updated_at)}
                </p>
                <button
                  className="project-delete"
                  onClick={(e) => deleteFlow(flow.id, e)}
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
    </div>
  );
}
