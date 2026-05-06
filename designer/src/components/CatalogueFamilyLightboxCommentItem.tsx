import { X } from 'lucide-react';

interface LightboxScreenshotComment {
  id: string;
  user_email: string;
  text: string;
  created_at: string;
}

interface CatalogueFamilyLightboxCommentItemProps {
  comment: LightboxScreenshotComment;
  userEmail: string;
  isAdmin: boolean;
  onDelete: (commentId: string) => void;
  formatDateTime: (value?: string) => string;
}

export function CatalogueFamilyLightboxCommentItem({
  comment,
  userEmail,
  isAdmin,
  onDelete,
  formatDateTime,
}: CatalogueFamilyLightboxCommentItemProps) {
  const canDelete = isAdmin || comment.user_email === userEmail;
  return (
    <div className="catalogue-lightbox-comment">
      <div className="catalogue-lightbox-comment-top">
        <span className="catalogue-lightbox-comment-email">{comment.user_email}</span>
        <span className="catalogue-lightbox-comment-time">{formatDateTime(comment.created_at)}</span>
        {canDelete && (
          <div className="catalogue-lightbox-comment-actions">
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
