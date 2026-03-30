import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import type { Project } from '../types';
import { supabase } from '../lib/supabase';

interface ProjectListProps {
  user: User;
  onLogout?: () => void;
}

export function ProjectList({ user, onLogout }: ProjectListProps) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (data) setProjects(data);
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

    // Delete storage files
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
          <span className="user-email">{user.email}</span>
          <button className="btn-secondary" onClick={handleSignOut}>Sign Out</button>
        </div>
      </header>

      <main className="project-list-main">
        <div className="project-list-actions">
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

        {projects.length === 0 ? (
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
                <h3>{project.name}</h3>
                <p className="project-date">
                  {new Date(project.updated_at).toLocaleDateString()}
                </p>
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
