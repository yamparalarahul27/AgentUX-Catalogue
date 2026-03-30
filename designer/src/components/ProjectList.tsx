import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { Project } from '../types';
import { supabase } from '../lib/supabase';

interface ProjectWithCounts extends Project {
  flow_count?: number;
}

interface ProjectListProps {
  user: User;
  onLogout?: () => void;
}

function truncateEmail(email: string, maxLen = 24): string {
  if (email.length <= maxLen) return email;
  const [local, domain] = email.split('@');
  if (!domain) return email.slice(0, maxLen) + '...';
  const keep = Math.max(3, Math.floor((maxLen - domain.length - 4) / 2));
  return `${local.slice(0, keep)}...@${domain}`;
}

export function ProjectList({ user, onLogout }: ProjectListProps) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithCounts[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (data) {
      // Fetch flow counts for each project
      const withCounts: ProjectWithCounts[] = await Promise.all(
        data.map(async (p: Project) => {
          const { count } = await supabase
            .from('connections')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', p.id);
          return { ...p, flow_count: count ?? 0 };
        }),
      );
      setProjects(withCounts);
    }
    setLoading(false);
  }

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from('projects')
      .insert({ name: newName.trim(), user_id: user.id })
      .select()
      .single();

    setCreating(false);
    setNewName('');
    setShowInput(false);

    if (data && !error) {
      navigate(`/project/${data.id}`);
    }
  }

  async function deleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this project and all its screenshots?')) return;

    const { data: screenshots } = await supabase
      .from('screenshots')
      .select('storage_path')
      .eq('project_id', id);

    if (screenshots?.length) {
      await supabase.storage
        .from('screenshots')
        .remove(screenshots.map((s) => s.storage_path));
    }

    await supabase.from('projects').delete().eq('id', id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  function startRename(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(name);
  }

  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      await supabase.from('projects').update({ name: trimmed }).eq('id', renamingId);
      setProjects((prev) => prev.map((p) => (p.id === renamingId ? { ...p, name: trimmed } : p)));
    }
    setRenamingId(null);
  }

  function handleSignOut() {
    if (onLogout) onLogout();
  }

  return (
    <div className="project-list-page">
      <header className="project-list-header">
        <div className="header-left">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <path d="M3 7l6-4 6 4 6-4v14l-6 4-6-4-6 4V7z" />
            <path d="M9 3v14" />
            <path d="M15 7v14" />
          </svg>
          <h1>Flow Builder</h1>
        </div>
        <div className="header-right">
          <span className="user-email" title={user.email || ''}>{truncateEmail(user.email || '')}</span>
          <button className="btn-secondary" onClick={handleSignOut}>Sign Out</button>
        </div>
      </header>

      <main className="project-list-main">
        <div className="project-list-actions">
          <h2 className="project-list-title">Projects</h2>
          {showInput ? (
            <div className="new-project-input">
              <input
                type="text"
                placeholder="Project name (e.g., Exchange Platforms)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createProject()}
                autoFocus
              />
              <button className="btn-primary" onClick={createProject} disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button className="btn-secondary" onClick={() => setShowInput(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setShowInput(true)}>
              + New Project
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p>Loading projects...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3f3f46" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            <h2>No projects yet</h2>
            <p>Create a project folder to start building UX flows from screenshots.</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <div className="project-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                </div>
                {renamingId === project.id ? (
                  <input
                    className="project-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <h3 onDoubleClick={(e) => startRename(project.id, project.name, e)} title="Double-click to rename">
                    {project.name}
                  </h3>
                )}
                <p className="project-date">
                  {new Date(project.updated_at).toLocaleDateString()}
                </p>
                {(project.flow_count ?? 0) > 0 && (
                  <p className="project-flow-count">
                    {project.flow_count} flow{project.flow_count !== 1 ? 's' : ''}
                  </p>
                )}
                <button
                  className="project-delete"
                  onClick={(e) => deleteProject(project.id, e)}
                  title="Delete project"
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
