import { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, Eye, EyeOff, Pencil, X } from 'lucide-react';

import { IconTooltip, IconTooltipProvider } from './IconTooltip';

interface LightboxScreenshotComment {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
  is_public?: boolean;
  // Edit + reply support — see designer/src/types.ts for the full shape.
  updated_at?: string | null;
  deleted_at?: string | null;
  parent_id?: string | null;
}

interface CatalogueFamilyLightboxCommentItemProps {
  comment: LightboxScreenshotComment;
  // Render hints from the parent — derived from the tree-build in
  // CatalogueFamilyLightbox so this component stays a dumb leaf.
  isReply?: boolean;     // indent + thread-bar styling
  hasReplies?: boolean;  // hides the Reply button on parents that
                         // already have children — v1 caps at 1 level
  userEmail: string;
  isAdmin: boolean;
  onDelete: (commentId: string) => void;
  onEdit?: (commentId: string, nextText: string) => void;
  onReply?: (commentId: string) => void;
  onToggleIsPublic: (commentId: string, nextIsPublic: boolean) => void;
  formatDateTime: (value?: string) => string;
}

export function CatalogueFamilyLightboxCommentItem({
  comment,
  isReply = false,
  hasReplies = false,
  userEmail,
  isAdmin,
  onDelete,
  onEdit,
  onReply,
  onToggleIsPublic,
  formatDateTime,
}: CatalogueFamilyLightboxCommentItemProps) {
  const canManage = isAdmin || comment.user_email === userEmail;
  const canEdit = comment.user_email === userEmail;
  const isPublic = comment.is_public === true;
  const isDeleted = Boolean(comment.deleted_at);
  const isEdited = Boolean(comment.updated_at);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Sync the draft back to the live text whenever a server update
    // lands (e.g. another tab edited the comment) — but only when the
    // user isn't actively typing to avoid clobbering their input.
    if (!isEditing) setDraft(comment.text);
  }, [comment.text, isEditing]);

  function beginEdit() {
    setDraft(comment.text);
    setIsEditing(true);
    // Focus + caret-to-end after the textarea mounts.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function cancelEdit() {
    setDraft(comment.text);
    setIsEditing(false);
  }

  function submitEdit() {
    const trimmed = draft.trim();
    if (!onEdit || !trimmed || trimmed === comment.text) {
      setIsEditing(false);
      return;
    }
    onEdit(comment.id, trimmed);
    setIsEditing(false);
  }

  return (
    <div className={`catalogue-lightbox-comment${isReply ? ' is-reply' : ''}${isDeleted ? ' is-deleted' : ''}`}>
      <div className="catalogue-lightbox-comment-top">
        <span className="catalogue-lightbox-comment-email">{comment.user_email}</span>
        <span className="catalogue-lightbox-comment-time">
          {formatDateTime(comment.created_at)}
          {isEdited && !isDeleted && (
            <span className="catalogue-lightbox-comment-edited-tag">(edited)</span>
          )}
        </span>
        {!isDeleted && (canManage || (onReply && !isReply && !hasReplies)) && (
          <div className="catalogue-lightbox-comment-actions">
            {onReply && !isReply && !hasReplies && (
              <IconTooltipProvider>
                <IconTooltip label="Reply">
                  <button
                    type="button"
                    className="catalogue-lightbox-comment-reply"
                    aria-label="Reply to this comment"
                    onClick={() => onReply(comment.id)}
                  >
                    <CornerUpLeft size={12} />
                  </button>
                </IconTooltip>
              </IconTooltipProvider>
            )}
            {canManage && (
              <button
                type="button"
                className={`catalogue-lightbox-comment-share-toggle${isPublic ? ' is-on' : ''}`}
                title={isPublic ? 'Visible on share page · click to hide' : 'Hidden from share page · click to show'}
                aria-label={isPublic ? 'Hide from share page' : 'Show on share page'}
                aria-pressed={isPublic}
                onClick={() => onToggleIsPublic(comment.id, !isPublic)}
              >
                {isPublic ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            )}
            {canEdit && onEdit && !isEditing && (
              <IconTooltipProvider>
                <IconTooltip label="Edit comment">
                  <button
                    type="button"
                    className="catalogue-lightbox-comment-edit"
                    aria-label="Edit comment"
                    onClick={beginEdit}
                  >
                    <Pencil size={12} />
                  </button>
                </IconTooltip>
              </IconTooltipProvider>
            )}
            {canManage && (
              <IconTooltipProvider>
                <IconTooltip label="Delete comment">
                  <button
                    type="button"
                    className="catalogue-lightbox-comment-delete"
                    aria-label="Delete comment"
                    onClick={() => onDelete(comment.id)}
                  >
                    <X size={12} />
                  </button>
                </IconTooltip>
              </IconTooltipProvider>
            )}
          </div>
        )}
      </div>
      {isDeleted ? (
        <p className="catalogue-lightbox-comment-text">Comment removed</p>
      ) : isEditing ? (
        <div className="catalogue-lightbox-comment-edit-form">
          <textarea
            ref={textareaRef}
            className="catalogue-lightbox-comment-edit-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // ⌘/Ctrl+Enter saves, Esc cancels — matches editor conventions.
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                submitEdit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEdit();
              }
            }}
            aria-label="Edit comment text"
          />
          <div className="catalogue-lightbox-comment-edit-actions">
            <button
              type="button"
              className="catalogue-lightbox-comment-edit-cancel"
              onClick={cancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="catalogue-lightbox-comment-edit-save"
              onClick={submitEdit}
              disabled={!draft.trim() || draft.trim() === comment.text}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="catalogue-lightbox-comment-text">{comment.text}</p>
      )}
    </div>
  );
}
