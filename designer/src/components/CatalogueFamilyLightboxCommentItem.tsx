import { X } from 'lucide-react';

interface LightboxScreenshotComment {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
  resolved_at?: string | null;
  resolved_by_email?: string | null;
}

interface CatalogueFamilyLightboxCommentItemProps {
  comment: LightboxScreenshotComment;
  userEmail: string;
  onDelete: (commentId: string) => void;
  onToggleResolve: (comment: LightboxScreenshotComment) => void;
  formatDateTime: (value?: string) => string;
}

export function CatalogueFamilyLightboxCommentItem({
  comment,
  userEmail,
  onDelete,
  onToggleResolve,
  formatDateTime,
}: CatalogueFamilyLightboxCommentItemProps) {
  return (
    <div className={`catalogue-lightbox-comment ${comment.resolved_at ? 'is-resolved' : ''}`}>
      <div className="catalogue-lightbox-comment-top">
        <span className="catalogue-lightbox-comment-email">{comment.user_email}</span>
        <span className="catalogue-lightbox-comment-time">{formatDateTime(comment.created_at)}</span>
        {comment.resolved_at && (
          <span className="catalogue-lightbox-comment-resolved-badge">
            Resolved
          </span>
        )}
        <div className="catalogue-lightbox-comment-actions">
          <button
            type="button"
            className="catalogue-lightbox-comment-resolve"
            title={comment.resolved_at ? 'Mark as open' : 'Resolve comment'}
            onClick={() => onToggleResolve(comment)}
          >
            {comment.resolved_at ? 'Open' : 'Resolve'}
          </button>
          {comment.user_email === userEmail && (
            <button
              type="button"
              className="catalogue-lightbox-comment-delete"
              title="Delete comment"
              onClick={() => onDelete(comment.id)}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <p className="catalogue-lightbox-comment-text">{comment.text}</p>
      {comment.resolved_at && (
        <p className="catalogue-lightbox-comment-resolved-copy">
          Resolved {formatDateTime(comment.resolved_at)}{comment.resolved_by_email ? ` by ${comment.resolved_by_email}` : ''}
        </p>
      )}
    </div>
  );
}
