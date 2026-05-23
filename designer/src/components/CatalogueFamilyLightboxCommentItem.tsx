import { Eye, EyeOff, X } from 'lucide-react';

interface LightboxScreenshotComment {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
  is_public?: boolean;
}

interface CatalogueFamilyLightboxCommentItemProps {
  comment: LightboxScreenshotComment;
  userEmail: string;
  isAdmin: boolean;
  onDelete: (commentId: string) => void;
  onToggleIsPublic: (commentId: string, nextIsPublic: boolean) => void;
  formatDateTime: (value?: string) => string;
}

export function CatalogueFamilyLightboxCommentItem({
  comment,
  userEmail,
  isAdmin,
  onDelete,
  onToggleIsPublic,
  formatDateTime,
}: CatalogueFamilyLightboxCommentItemProps) {
  const canManage = isAdmin || comment.user_email === userEmail;
  const isPublic = comment.is_public === true;
  return (
    <div className="catalogue-lightbox-comment">
      <div className="catalogue-lightbox-comment-top">
        <span className="catalogue-lightbox-comment-email">{comment.user_email}</span>
        <span className="catalogue-lightbox-comment-time">{formatDateTime(comment.created_at)}</span>
        {canManage && (
          <div className="catalogue-lightbox-comment-actions">
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
            <button
              type="button"
              className="catalogue-lightbox-comment-delete"
              title="Delete comment"
              aria-label="Delete comment"
              onClick={() => onDelete(comment.id)}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
      <p className="catalogue-lightbox-comment-text">{comment.text}</p>
    </div>
  );
}
